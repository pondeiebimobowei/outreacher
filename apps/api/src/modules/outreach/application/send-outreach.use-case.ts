import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import {
  AppConflictException,
  AppNotFoundException,
  AppUnprocessableEntityException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { SendEligibilityService } from '../../email/domain/send-eligibility.service';

export interface SendOutreachCommand {
  workspaceId: string;
  outreachId: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown> | null;
}

function canonicalizeJson(value: unknown): string {
  if (value === undefined) {
    return 'null';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  return (
    '{' +
    sortedKeys
      .map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`)
      .join(',') +
    '}'
  );
}

@Injectable()
export class SendOutreachUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibilityService: SendEligibilityService,
  ) {}

  async execute(command: SendOutreachCommand): Promise<{ jobId: string; status: string }> {
    const { workspaceId, outreachId, idempotencyKey, payload } = command;

    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new AppValidationException('idempotency-key header is required');
    }

    const normalizedPayload =
      payload && typeof payload === 'object' ? payload : {};
    const requestIdentity = {
      outreachId,
      payload: normalizedPayload,
    };
    const requestHash = crypto
      .createHash('sha256')
      .update(canonicalizeJson(requestIdentity))
      .digest('hex');

    return this.prisma.$transaction(async (tx: any) => {
      // 0. Check Idempotency Record
      const existingRecord = await tx.idempotencyRecord.findFirst({
        where: {
          workspaceId,
          operation: 'POST:/outreaches/:id/send',
          key: idempotencyKey,
        },
      });

      if (existingRecord) {
        if (existingRecord.targetId !== outreachId) {
          throw new AppConflictException(
            'Idempotency key reused for different target',
          );
        }
        if (existingRecord.requestHash && existingRecord.requestHash !== requestHash) {
          throw new AppConflictException(
            'Idempotency key reused with different request payload',
          );
        }
        return { jobId: existingRecord.jobId, status: 'QUEUED' };
      }

      // 1. Fetch Outreach
      const outreach = await tx.outreach.findFirst({
        where: { id: outreachId, workspaceId },
      });

      if (!outreach) {
        throw new AppNotFoundException(`Outreach ${outreachId} not found`);
      }

      if (outreach.status !== 'APPROVED') {
        throw new AppConflictException(
          `Cannot send outreach in ${outreach.status} status. Only APPROVED outreaches can be sent.`,
        );
      }

      // Real PostgreSQL row locking
      if (typeof tx.$queryRaw === 'function') {
        const lockedOutreaches = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM outreaches
          WHERE id = ${outreachId} AND workspace_id = ${workspaceId}
          FOR UPDATE
        `;

        if (Array.isArray(lockedOutreaches) && lockedOutreaches.length > 0) {
          const lockedOutreach = lockedOutreaches[0];
          if (lockedOutreach.status !== 'APPROVED') {
            throw new AppConflictException(
              `Cannot send outreach in ${lockedOutreach.status} status. Only APPROVED outreaches can be sent.`,
            );
          }
        }
      }

      // 2. Fetch Campaign and CampaignRecipient if linked
      let campaign: any = null;
      let recipient: any = null;
      if (outreach.campaignRecipientId) {
        recipient = await tx.campaignRecipient.findFirst({
          where: { id: outreach.campaignRecipientId, workspaceId },
        });
        if (!recipient) {
          throw new AppNotFoundException(
            `Campaign recipient ${outreach.campaignRecipientId} not found`,
          );
        }

        campaign = await tx.campaign.findFirst({
          where: { id: recipient.campaignId, workspaceId },
        });
        if (!campaign) {
          throw new AppNotFoundException(`Campaign ${recipient.campaignId} not found`);
        }

        if (campaign.status !== 'ACTIVE') {
          throw new AppConflictException(
            `Cannot send outreach: Campaign is in ${campaign.status} status (must be ACTIVE)`,
          );
        }

        if (recipient.status !== 'PENDING') {
          throw new AppConflictException(
            `Cannot send initial outreach: Campaign recipient is in ${recipient.status} status (must be PENDING)`,
          );
        }
      }

      // 3. Fetch PCA
      const pca = await tx.personCompanyAssociation.findFirst({
        where: { id: outreach.personCompanyAssociationId, workspaceId },
        include: { person: true },
      });

      if (!pca) {
        throw new AppNotFoundException(
          `Contact association ${outreach.personCompanyAssociationId} not found`,
        );
      }

      if (pca.conversationState === 'STOPPED') {
        throw new AppUnprocessableEntityException('Contact is suppressed/stopped');
      }

      if (outreach.campaignRecipientId) {
        if (pca.conversationState === 'REPLIED') {
          throw new AppConflictException(
            'Contact has already replied on this relationship',
          );
        }
        if (pca.conversationState === 'ACTIVE') {
          throw new AppConflictException(
            'Contact is already active in outreach on this relationship',
          );
        }
      }

      // 4. Check suppression
      if (pca.person?.email) {
        const suppressed = await tx.suppression.findFirst({
          where: {
            workspaceId,
            email: pca.person.email.trim().toLowerCase(),
          },
        });
        if (suppressed) {
          throw new AppUnprocessableEntityException('Contact is suppressed/stopped');
        }
      }

      // 5. Sequence uniqueness check
      const existingSend = await tx.emailSend.findFirst({
        where: { outreachId, sequence: 0 },
      });
      if (existingSend) {
        throw new AppConflictException(
          'EmailSend sequence 0 already exists for this outreach',
        );
      }

      const expectedStateVersion = pca.stateVersion;

      // 6. Reserve sender capacity and create EmailSend
      const emailSend =
        await this.eligibilityService.reserveSenderCapacityAndCreateEmailSend(tx, {
          workspaceId,
          outreachId,
          sequence: 0,
          type: 'INITIAL',
          expectedStateVersion,
          subject: outreach.subject,
          body: outreach.message,
          preferredSenderAccountId: outreach.senderAccountId,
          campaignId: campaign?.id ?? null,
        });

      // 7. Transition Outreach: APPROVED -> SENDING
      await tx.outreach.update({
        where: { id: outreachId },
        data: { status: 'SENDING' },
      });

      // If campaign-linked, transition recipient: PENDING -> ACTIVE
      if (recipient) {
        await tx.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'ACTIVE' },
        });
      }

      // 8. Enqueue EMAIL_DISPATCH job
      const job = await tx.job.create({
        data: {
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: 'PENDING',
          payload: {
            emailSendId: emailSend.id,
            outreachId: outreach.id,
          },
          idempotencyKey: `dispatch:${emailSend.id}`,
        },
      });

      // 9. Record IdempotencyRecord
      await tx.idempotencyRecord.create({
        data: {
          workspaceId,
          operation: 'POST:/outreaches/:id/send',
          key: idempotencyKey,
          targetId: outreachId,
          requestHash,
          jobId: job.id,
        },
      });

      return { jobId: job.id, status: 'QUEUED' };
    });
  }
}
