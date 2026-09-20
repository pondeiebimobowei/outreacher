import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

export class ContactStateTransitionException extends Error {
  constructor(
    message: string,
    public readonly isRetryable: boolean
  ) {
    super(message);
    this.name = 'ContactStateTransitionException';
  }
}

@Injectable()
export class MarkContactRepliedUseCase {
  private readonly logger = new Logger(MarkContactRepliedUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(campaignContactId: string, workspaceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Lock the contact row
      const contacts = await tx.$queryRaw<Array<{ id: string; workspace_id: string; status: string }>>`
        SELECT id, workspace_id, status 
        FROM campaign_contacts 
        WHERE id = ${campaignContactId} 
          AND workspace_id = ${workspaceId} 
        FOR UPDATE
      `;

      if (contacts.length === 0) {
        throw new ContactStateTransitionException(`CampaignContact ${campaignContactId} not found or tenant mismatch`, false);
      }

      const contact = contacts[0];

      // 2. Evaluate state
      if (contact.status === 'REPLIED') {
        this.logger.log(`CampaignContact ${campaignContactId} is already REPLIED. Idempotent success.`);
        return;
      }

      if (contact.status === 'SENT' || contact.status === 'FOLLOW_UP_DUE') {
        this.logger.log(`Transitioning CampaignContact ${campaignContactId} from ${contact.status} to REPLIED.`);
        await tx.$queryRaw`
          UPDATE campaign_contacts 
          SET status = 'REPLIED', updated_at = NOW() 
          WHERE id = ${campaignContactId} 
            AND workspace_id = ${workspaceId}
        `;
        return;
      }

      if (contact.status === 'SENDING') {
        this.logger.warn(`CampaignContact ${campaignContactId} is SENDING. Deferring REPLIED transition (retryable race).`);
        throw new ContactStateTransitionException(`CampaignContact is SENDING. Defers transition.`, true);
      }

      this.logger.error(`CampaignContact ${campaignContactId} in invalid source state ${contact.status} for REPLIED transition.`);
      throw new ContactStateTransitionException(`Invalid source state: ${contact.status}`, false);
    });
  }
}
