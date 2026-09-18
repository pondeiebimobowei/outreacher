import { Injectable } from '@nestjs/common';
import {
  CampaignContactStatus,
  CampaignStatus,
  EmailSendStatus,
  EmailSendType,
  JobStatus,
  Prisma,
} from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { SendEligibilityService } from '../domain/send-eligibility.service';

export interface SendEmailCommand {
  workspaceId: string;
  campaignContactId: string;
  clientKey: string;
}

export interface SendEmailResponse {
  jobId: string;
  message: string;
}

@Injectable()
export class SendEmailUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendEligibilityService: SendEligibilityService,
  ) {}

  public async execute(command: SendEmailCommand): Promise<SendEmailResponse> {
    const { workspaceId, campaignContactId } = command;

    if (!command.clientKey || !command.clientKey.trim()) {
      throw new AppValidationException(
        'Missing required Idempotency-Key header',
      );
    }
    const normalizedKey = command.clientKey.trim();

    // 1. Pre-transaction idempotency lookup
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key: normalizedKey,
        },
      },
    });

    if (existingRecord) {
      if (existingRecord.targetId === campaignContactId) {
        return existingRecord.responseBody as unknown as SendEmailResponse;
      }
      throw new AppConflictException(
        `Idempotency-Key '${normalizedKey}' was already used for a different campaign contact`,
      );
    }

    // 2. Atomic reservation transaction
    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Fetch target contact with parent campaign and recipient details
          const campaignContact = await tx.campaignContact.findUnique({
            where: { id: campaignContactId },
            include: {
              campaign: true,
              contact: true,
            },
          });

          if (!campaignContact || campaignContact.workspaceId !== workspaceId) {
            throw new AppNotFoundException('Campaign contact not found');
          }

          // Contact-State Race Replay Path:
          // If contact is not READY (e.g. concurrent identical request updated it to SENDING),
          // check if an idempotency record for (workspaceId, normalizedKey) was committed in the meantime
          if (campaignContact.status !== CampaignContactStatus.READY) {
            const committedRecord = await tx.idempotencyRecord.findUnique({
              where: {
                workspaceId_key: {
                  workspaceId,
                  key: normalizedKey,
                },
              },
            });

            if (
              committedRecord &&
              committedRecord.targetId === campaignContactId
            ) {
              return committedRecord.responseBody as unknown as SendEmailResponse;
            }
          }

          // Side-effect-free eligibility check
          const eligibilityResult =
            await this.sendEligibilityService.checkEligibility({
              workspaceId,
              campaign: campaignContact.campaign,
              campaignContact,
            });

          // Concurrent DRAFT activation:
          // Exactly one transaction performs the conditional activation; concurrent reservations
          // observe the resulting ACTIVE campaign and proceed seamlessly.
          if (campaignContact.campaign.status === CampaignStatus.DRAFT) {
            await tx.campaign.updateMany({
              where: {
                id: campaignContact.campaign.id,
                workspaceId,
                status: CampaignStatus.DRAFT,
              },
              data: { status: CampaignStatus.ACTIVE },
            });
          }

          // Atomically transition CampaignContact READY -> SENDING
          await tx.campaignContact.update({
            where: { id: campaignContact.id },
            data: { status: CampaignContactStatus.SENDING },
          });

          // Create EmailSend in RESERVED status
          const emailSend = await tx.emailSend.create({
            data: {
              workspaceId,
              campaignId: campaignContact.campaignId,
              campaignContactId: campaignContact.id,
              type: EmailSendType.INITIAL,
              subject: eligibilityResult.subject,
              body: eligibilityResult.body,
              status: EmailSendStatus.RESERVED,
              reservedAt: new Date(),
            },
          });

          // Create Job in PENDING status with canonical internal idempotency key
          const canonicalJobKey = `send:${campaignContact.id}:1`;
          const job = await tx.job.create({
            data: {
              workspaceId,
              type: 'EMAIL_DISPATCH',
              status: JobStatus.PENDING,
              idempotencyKey: canonicalJobKey,
              payload: {
                emailSendId: emailSend.id,
                campaignContactId: campaignContact.id,
                workspaceId,
              },
            },
          });

          const responsePayload: SendEmailResponse = {
            jobId: job.id,
            message: 'Dispatch enqueued',
          };

          // Persist IdempotencyRecord
          await tx.idempotencyRecord.create({
            data: {
              workspaceId,
              key: normalizedKey,
              route: '/api/v1/campaign-contacts/:id/send',
              targetId: campaignContact.id,
              jobId: job.id,
              responseStatus: 202,
              responseBody: responsePayload as unknown as Prisma.InputJsonValue,
            },
          });

          return responsePayload;
        },
      );
    } catch (error: any) {
      // 3. Handle PostgreSQL unique constraint race on IdempotencyRecord (Prisma P2002)
      if (error?.code === 'P2002') {
        const committedRecord = await this.prisma.idempotencyRecord.findUnique({
          where: {
            workspaceId_key: {
              workspaceId,
              key: normalizedKey,
            },
          },
        });

        if (committedRecord) {
          if (committedRecord.targetId === campaignContactId) {
            return committedRecord.responseBody as unknown as SendEmailResponse;
          }
          throw new AppConflictException(
            `Idempotency-Key '${normalizedKey}' was already used for a different campaign contact`,
          );
        }
      }

      throw error;
    }
  }
}
