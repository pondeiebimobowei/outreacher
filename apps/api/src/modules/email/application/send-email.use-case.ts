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
      throw new AppValidationException('Missing required Idempotency-Key header');
    }
    const normalizedKey = command.clientKey.trim();

    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { workspaceId_key: { workspaceId, key: normalizedKey } },
    });

    if (existingRecord) {
      if (existingRecord.targetId === campaignContactId) {
        return existingRecord.responseBody as unknown as SendEmailResponse;
      }
      throw new AppConflictException(`Idempotency-Key '${normalizedKey}' was already used for a different campaign contact`);
    }

    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const campaignContact = await tx.campaignContact.findUnique({
          where: { id: campaignContactId },
          include: { campaign: true, contact: true },
        });

        if (!campaignContact || campaignContact.workspaceId !== workspaceId) {
          throw new AppNotFoundException('Campaign contact not found');
        }

        if (campaignContact.status !== CampaignContactStatus.READY) {
          const committedRecord = await tx.idempotencyRecord.findUnique({
            where: { workspaceId_key: { workspaceId, key: normalizedKey } },
          });
          if (committedRecord && committedRecord.targetId === campaignContactId) {
            return committedRecord.responseBody as unknown as SendEmailResponse;
          }
        }

        const eligibilityResult = await this.sendEligibilityService.checkEligibility({
          workspaceId,
          campaign: campaignContact.campaign,
          campaignContact,
        });

        if (campaignContact.campaign.status === CampaignStatus.DRAFT) {
          await tx.campaign.updateMany({
            where: { id: campaignContact.campaign.id, workspaceId, status: CampaignStatus.DRAFT },
            data: { status: CampaignStatus.ACTIVE },
          });
        }

        await tx.campaignContact.update({
          where: { id: campaignContact.id },
          data: { status: CampaignContactStatus.SENDING },
        });

        const emailSend = await this.sendEligibilityService.reserveSenderCapacityAndCreateEmailSend(
          tx,
          workspaceId,
          campaignContact.campaignId,
          {
            campaignContactId: campaignContact.id,
            type: EmailSendType.INITIAL,
            subject: eligibilityResult.subject,
            body: eligibilityResult.body,
          }
        );

        const canonicalJobKey = `send:${emailSend.id}`;
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

        const responsePayload: SendEmailResponse = { jobId: job.id, message: 'Dispatch enqueued' };

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
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const committedRecord = await this.prisma.idempotencyRecord.findUnique({
          where: { workspaceId_key: { workspaceId, key: normalizedKey } },
        });
        if (committedRecord) {
          if (committedRecord.targetId === campaignContactId) {
            return committedRecord.responseBody as unknown as SendEmailResponse;
          }
          throw new AppConflictException(`Idempotency-Key '${normalizedKey}' was already used for a different campaign contact`);
        }
      }
      throw error;
    }
  }
}
