import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { AppUnprocessableEntityException } from '../../../common/errors/application.exception';

@Injectable()
export class ResumeOutreachUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workspaceId: string,
    outreachId: string,
  ): Promise<{ id: string; status: string }> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Fetch Outreach with PCA, Person, and CampaignRecipient
      const outreach = await tx.outreach.findFirst({
        where: {
          id: outreachId,
          workspaceId,
        },
        include: {
          personCompanyAssociation: {
            include: { person: true },
          },
          campaignRecipient: {
            include: { campaign: true },
          },
        },
      });

      if (!outreach) {
        throw new NotFoundException(
          `Outreach ${outreachId} not found in workspace`,
        );
      }

      // 2. Global Lock Order:
      // Campaigns -> CampaignRecipients -> PCAs -> Outreaches -> EmailSends
      if (outreach.campaignRecipient) {
        const campaignId = outreach.campaignRecipient.campaignId;
        const recipientId = outreach.campaignRecipient.id;

        await tx.$queryRaw`
          SELECT id FROM campaigns
          WHERE id = ${campaignId}
            AND workspace_id = ${workspaceId}
          FOR UPDATE
        `;

        await tx.$queryRaw`
          SELECT id FROM campaign_recipients
          WHERE id = ${recipientId}
            AND workspace_id = ${workspaceId}
          FOR UPDATE
        `;

        const freshCampaign = await tx.campaign.findUnique({
          where: { id: campaignId },
        });
        const freshRecipient = await tx.campaignRecipient.findUnique({
          where: { id: recipientId },
        });

        if (!freshCampaign || freshCampaign.status !== 'ACTIVE') {
          throw new ConflictException(
            `Cannot resume campaign-linked outreach while campaign is ${freshCampaign?.status ?? 'UNKNOWN'}. Expected ACTIVE.`,
          );
        }

        const ineligibleRecipientStatuses = [
          'COMPLETED',
          'SUPPRESSED',
          'FAILED',
          'REMOVED',
        ];
        if (
          !freshRecipient ||
          ineligibleRecipientStatuses.includes(freshRecipient.status)
        ) {
          throw new ConflictException(
            `Cannot resume outreach: campaign recipient is in status ${freshRecipient?.status ?? 'UNKNOWN'}.`,
          );
        }
      }

      await tx.$queryRaw`
        SELECT id FROM person_company_associations
        WHERE id = ${outreach.personCompanyAssociationId}
          AND workspace_id = ${workspaceId}
        FOR UPDATE
      `;

      await tx.$queryRaw`
        SELECT id FROM outreaches
        WHERE id = ${outreachId}
          AND workspace_id = ${workspaceId}
        FOR UPDATE
      `;

      await tx.$queryRaw`
        SELECT id FROM email_sends
        WHERE outreach_id = ${outreachId}
          AND workspace_id = ${workspaceId}
        ORDER BY id ASC
        FOR UPDATE
      `;

      // 3. Verify Outreach is in PAUSED status
      if (outreach.status !== 'PAUSED') {
        throw new ConflictException(
          `Cannot resume outreach in status ${outreach.status}. Expected PAUSED.`,
        );
      }

      const pca = outreach.personCompanyAssociation;

      // 4. Verify PCA conversationState is not STOPPED or REPLIED
      if (pca.conversationState === 'STOPPED') {
        throw new AppUnprocessableEntityException(
          'Contact is suppressed/stopped',
        );
      }

      if (pca.conversationState === 'REPLIED') {
        throw new ConflictException(
          'Cannot resume outreach when contact has replied',
        );
      }

      // 5. Verify email is not currently suppressed
      const email = pca.workEmail || pca.person?.email;
      if (email) {
        const suppression = await tx.suppression.findUnique({
          where: {
            workspaceId_email: {
              workspaceId,
              email: email.trim().toLowerCase(),
            },
          },
        });

        if (suppression) {
          throw new AppUnprocessableEntityException(
            'Contact is suppressed/stopped',
          );
        }
      }

      // 6. Determine target status based on whether initial email was already sent
      const sentSends = await tx.emailSend.findMany({
        where: {
          outreachId,
          status: 'SENT',
        },
      });

      const targetStatus = sentSends.length > 0 ? 'ACTIVE' : 'APPROVED';

      // 7. If campaign-linked and recipient was PAUSED, restore recipient status
      if (outreach.campaignRecipient && outreach.campaignRecipient.status === 'PAUSED') {
        await tx.campaignRecipient.update({
          where: { id: outreach.campaignRecipient.id },
          data: { status: sentSends.length > 0 ? 'ACTIVE' : 'PENDING' },
        });
      }

      // 8. Reopen jobs: Reopens CANCELLED(PAUSED) jobs, but STRICTLY REFUSES to reopen CANCELLED(SUPPRESSED)
      await tx.$executeRaw`
        UPDATE jobs
        SET status = 'PENDING'::"JobStatus",
            cancellation_reason = NULL,
            updated_at = NOW()
        WHERE workspace_id = ${workspaceId}
          AND status = 'CANCELLED'::"JobStatus"
          AND cancellation_reason = 'PAUSED'::"JobCancellationReason"
          AND payload->>'outreachId' = ${outreachId}
      `;

      // 9. Update Outreach status
      const updated = await tx.outreach.update({
        where: { id: outreachId },
        data: { status: targetStatus },
      });

      return {
        id: updated.id,
        status: updated.status,
      };
    });
  }
}
