import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '@repo/db';

export class ContactStateTransitionException extends Error {
  constructor(
    message: string,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = 'ContactStateTransitionException';
  }
}

@Injectable()
export class MarkContactRepliedUseCase {
  private readonly logger = new Logger(MarkContactRepliedUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(campaignMemberId: string, workspaceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Lock the contact row
      const contacts = await tx.$queryRaw<
        Array<{ id: string; workspace_id: string; status: string }>
      >`
        SELECT id, workspace_id, status 
        FROM campaign_contacts 
        WHERE id = ${campaignMemberId} 
          AND workspace_id = ${workspaceId} 
        FOR UPDATE
      `;

      if (contacts.length === 0) {
        throw new ContactStateTransitionException(
          `CampaignMember ${campaignMemberId} not found or tenant mismatch`,
          false,
        );
      }

      const contact = contacts[0];

      // 2. Evaluate state
      if (contact.status === 'REPLIED') {
        this.logger.log(
          `CampaignMember ${campaignMemberId} is already REPLIED. Idempotent success.`,
        );
      } else if (
        contact.status === 'SENT' ||
        contact.status === 'FOLLOW_UP_DUE'
      ) {
        this.logger.log(
          `Transitioning CampaignMember ${campaignMemberId} from ${contact.status} to REPLIED.`,
        );
        await tx.$queryRaw`
          UPDATE campaign_contacts 
          SET status = 'REPLIED', updated_at = NOW() 
          WHERE id = ${campaignMemberId} 
            AND workspace_id = ${workspaceId}
        `;
      } else if (contact.status === 'SENDING') {
        this.logger.warn(
          `CampaignMember ${campaignMemberId} is SENDING. Deferring REPLIED transition (retryable race).`,
        );
        throw new ContactStateTransitionException(
          `CampaignMember is SENDING. Deferring transition.`,
          true,
        );
      } else {
        this.logger.error(
          `CampaignMember ${campaignMemberId} in invalid source state ${contact.status} for REPLIED transition.`,
        );
        throw new ContactStateTransitionException(
          `Invalid source state: ${contact.status}`,
          false,
        );
      }

      // 3. Cancel eligible pending follow-up jobs for this contact
      const cancelledJobs = await tx.$executeRaw`
        UPDATE jobs
        SET
          status = 'COMPLETED'::"JobStatus",
          completed_at = NOW(),
          last_error = 'Cancelled due to inbound reply'
        WHERE
          workspace_id = ${workspaceId}
          AND type = 'SCHEDULED_FOLLOW_UP_CHECK'::"JobType"
          AND status = 'PENDING'::"JobStatus"
          AND payload->>'campaignMemberId' = ${campaignMemberId}
      `;

      if (cancelledJobs > 0) {
        this.logger.log(
          `Cancelled ${cancelledJobs} PENDING SCHEDULED_FOLLOW_UP_CHECK job(s) for CampaignMember ${campaignMemberId}.`,
        );
      }
    });
  }
}
