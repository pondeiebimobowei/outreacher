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

  /**
   * Relationship-wide reply effect with 2-step recipient re-query under Campaign lock.
   */
  async execute(pcaId: string, workspaceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Discover distinct Campaign IDs on that PCA
      const recipientCampaigns = await tx.$queryRaw<
        Array<{ campaign_id: string }>
      >`
        SELECT DISTINCT campaign_id
        FROM campaign_recipients
        WHERE person_company_association_id = ${pcaId}
          AND workspace_id = ${workspaceId}
      `;
      const campaignIds = recipientCampaigns
        .map((r) => r.campaign_id)
        .filter(Boolean)
        .sort();

      // 2. Lock Campaigns (id ASC FOR UPDATE)
      if (campaignIds.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM campaigns
          WHERE id IN (${Prisma.join(campaignIds)})
          ORDER BY id ASC
          FOR UPDATE
        `;
      }

      // 3. Re-query all CampaignRecipient records on that PCA under Campaign lock (id ASC FOR UPDATE)
      await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM campaign_recipients
        WHERE person_company_association_id = ${pcaId}
          AND workspace_id = ${workspaceId}
        ORDER BY id ASC
        FOR UPDATE
      `;

      // 4. Lock PCA (FOR UPDATE)
      const pcas = await tx.$queryRaw<
        Array<{ id: string; conversation_state: string; state_version: number }>
      >`
        SELECT id, conversation_state, state_version
        FROM person_company_associations
        WHERE id = ${pcaId}
          AND workspace_id = ${workspaceId}
        FOR UPDATE
      `;

      if (pcas.length === 0) {
        throw new ContactStateTransitionException(
          `PersonCompanyAssociation ${pcaId} not found or tenant mismatch`,
          false,
        );
      }

      // 5. Lock Outreaches (id ASC FOR UPDATE)
      const outreaches = await tx.$queryRaw<
        Array<{ id: string; status: string }>
      >`
        SELECT id, status FROM outreaches
        WHERE person_company_association_id = ${pcaId}
          AND workspace_id = ${workspaceId}
        ORDER BY id ASC
        FOR UPDATE
      `;

      // 6. Lock EmailSends (id ASC FOR UPDATE)
      const outreachIds = outreaches.map((o) => o.id);
      if (outreachIds.length > 0) {
        await tx.$queryRaw`
          SELECT id, status FROM email_sends
          WHERE outreach_id IN (${Prisma.join(outreachIds)})
            AND workspace_id = ${workspaceId}
          ORDER BY id ASC
          FOR UPDATE
        `;
      }

      // 7. Mark PersonCompanyAssociation.conversationState = 'REPLIED'
      await tx.personCompanyAssociation.update({
        where: { id: pcaId },
        data: {
          conversationState: 'REPLIED',
          stateVersion: { increment: 1 },
        },
      });

      // 8. Cancel pending SCHEDULED_FOLLOW_UP_CHECK jobs across PCA
      if (outreachIds.length > 0) {
        for (const oid of outreachIds) {
          await tx.$executeRaw`
            UPDATE jobs
            SET status = 'CANCELLED'::"JobStatus",
                cancellation_reason = 'CANCELLED_BY_USER'::"JobCancellationReason",
                last_error = 'Cancelled due to inbound reply',
                updated_at = NOW()
            WHERE workspace_id = ${workspaceId}
              AND type = 'SCHEDULED_FOLLOW_UP_CHECK'::"JobType"
              AND status = 'PENDING'::"JobStatus"
              AND payload->>'outreachId' = ${oid}
          `;
        }
      }

      // 9. Cancel in-flight RESERVED EmailSend records
      if (outreachIds.length > 0) {
        await tx.emailSend.updateMany({
          where: {
            outreachId: { in: outreachIds },
            status: 'RESERVED',
          },
          data: {
            status: 'CANCELLED' as any,
          },
        });
      }

      // 10. Transitions ALL CampaignRecipient records on that PCA with status IN ('PENDING', 'ACTIVE') immediately to COMPLETED
      await tx.campaignRecipient.updateMany({
        where: {
          personCompanyAssociationId: pcaId,
          workspaceId,
          status: { in: ['PENDING', 'ACTIVE'] },
        },
        data: {
          status: 'COMPLETED',
        },
      });
    });
  }
}
