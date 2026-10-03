import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SuppressionAction,
  SuppressionReason,
} from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';

export interface SuppressContactResult {
  success: boolean;
  email: string;
  affectedPcaIds: string[];
}

@Injectable()
export class SuppressContactUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workspaceId: string,
    contactId: string,
    userId?: string,
    reason?: SuppressionReason,
    notes?: string,
  ): Promise<SuppressContactResult> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Resolve contact & extract email
      let email: string | null = null;

      const pca = await tx.personCompanyAssociation.findFirst({
        where: { id: contactId, workspaceId },
        include: { person: true },
      });

      if (pca) {
        email = pca.workEmail || pca.person?.email || null;
      } else {
        const person = await tx.person.findFirst({
          where: { id: contactId, workspaceId },
          include: { personCompanyAssociations: true },
        });

        if (person) {
          email =
            person.email ||
            person.personCompanyAssociations.find((p) => p.workEmail)
              ?.workEmail ||
            null;
        }
      }

      if (!pca && !email) {
        throw new NotFoundException(
          `Contact ${contactId} not found in workspace`,
        );
      }

      if (!email) {
        throw new BadRequestException(
          `Contact ${contactId} has no associated email to suppress`,
        );
      }

      const normalizedEmail = email.trim().toLowerCase();

      // 2. Discover all PCAs in workspace matching this email
      const matchingPcas = await tx.personCompanyAssociation.findMany({
        where: {
          workspaceId,
          OR: [
            { workEmail: { equals: normalizedEmail, mode: 'insensitive' } },
            {
              person: {
                email: { equals: normalizedEmail, mode: 'insensitive' },
              },
            },
          ],
        },
        select: { id: true },
      });

      const pcaIds = matchingPcas.map((p) => p.id).sort();

      // 3. Discovers all associated campaigns across these PCAs
      let campaignIds: string[] = [];
      if (pcaIds.length > 0) {
        const recipientCampaigns = await tx.$queryRaw<
          Array<{ campaign_id: string }>
        >`
          SELECT DISTINCT campaign_id
          FROM campaign_recipients
          WHERE person_company_association_id IN (${Prisma.join(pcaIds)})
            AND workspace_id = ${workspaceId}
        `;
        campaignIds = recipientCampaigns
          .map((r) => r.campaign_id)
          .filter(Boolean)
          .sort();
      }

      // 4. Lock Campaigns (id ASC FOR UPDATE)
      if (campaignIds.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM campaigns
          WHERE id IN (${Prisma.join(campaignIds)})
          ORDER BY id ASC
          FOR UPDATE
        `;
      }

      // 5. Re-query and lock all affected CampaignRecipients under Campaign lock (id ASC FOR UPDATE)
      let recipientIds: string[] = [];
      if (pcaIds.length > 0) {
        const recipients = await tx.$queryRaw<
          Array<{ id: string; status: string }>
        >`
          SELECT id, status FROM campaign_recipients
          WHERE person_company_association_id IN (${Prisma.join(pcaIds)})
            AND workspace_id = ${workspaceId}
          ORDER BY id ASC
          FOR UPDATE
        `;
        recipientIds = recipients.map((r) => r.id);
      }

      // 6. Lock PCAs (id ASC FOR UPDATE)
      if (pcaIds.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM person_company_associations
          WHERE id IN (${Prisma.join(pcaIds)})
          ORDER BY id ASC
          FOR UPDATE
        `;
      }

      // 7. Lock Outreaches (id ASC FOR UPDATE)
      let outreachIds: string[] = [];
      if (pcaIds.length > 0) {
        const outreaches = await tx.$queryRaw<
          Array<{ id: string; status: string }>
        >`
          SELECT id, status FROM outreaches
          WHERE person_company_association_id IN (${Prisma.join(pcaIds)})
            AND workspace_id = ${workspaceId}
          ORDER BY id ASC
          FOR UPDATE
        `;
        outreachIds = outreaches.map((o) => o.id);
      }

      // 8. Lock EmailSends (id ASC FOR UPDATE)
      if (outreachIds.length > 0) {
        await tx.$queryRaw`
          SELECT id, status FROM email_sends
          WHERE outreach_id IN (${Prisma.join(outreachIds)})
            AND workspace_id = ${workspaceId}
          ORDER BY id ASC
          FOR UPDATE
        `;
      }

      // 9. Inserts/upserts email into active Suppression table
      await tx.suppression.upsert({
        where: {
          workspaceId_email: {
            workspaceId,
            email: normalizedEmail,
          },
        },
        create: {
          workspaceId,
          email: normalizedEmail,
          reason: reason || SuppressionReason.MANUAL,
          source: 'USER_ACTION',
          createdByUserId: userId || null,
        },
        update: {
          reason: reason || SuppressionReason.MANUAL,
          source: 'USER_ACTION',
          createdByUserId: userId || null,
        },
      });

      // 10. Inserts typed audit row into append-only SuppressionHistory
      await tx.suppressionHistory.create({
        data: {
          workspaceId,
          email: normalizedEmail,
          action: SuppressionAction.SUPPRESSED,
          reason: reason || SuppressionReason.MANUAL,
          source: 'USER_ACTION',
          notes: notes || null,
          actorUserId: userId || null,
        },
      });

      // 11. Transitions PCA.conversationState = 'STOPPED' (and stateVersion++) for ALL matching PCAs
      if (pcaIds.length > 0) {
        await tx.personCompanyAssociation.updateMany({
          where: { id: { in: pcaIds } },
          data: {
            conversationState: 'STOPPED',
            stateVersion: { increment: 1 },
          },
        });
      }

      // 12. Cancels pending jobs (cancellationReason: SUPPRESSED)
      if (outreachIds.length > 0) {
        for (const oid of outreachIds) {
          await tx.$executeRaw`
            UPDATE jobs
            SET status = 'CANCELLED'::"JobStatus",
                cancellation_reason = 'SUPPRESSED'::"JobCancellationReason",
                last_error = 'Cancelled due to contact suppression',
                updated_at = NOW()
            WHERE workspace_id = ${workspaceId}
              AND type = 'SCHEDULED_FOLLOW_UP_CHECK'::"JobType"
              AND status = 'PENDING'::"JobStatus"
              AND payload->>'outreachId' = ${oid}
          `;
        }
      }

      // 13. Cancels reserved sends
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

      // 14. Transitions active and pending campaign recipients to SUPPRESSED
      if (pcaIds.length > 0) {
        await tx.campaignRecipient.updateMany({
          where: {
            personCompanyAssociationId: { in: pcaIds },
            workspaceId,
            status: { in: ['PENDING', 'ACTIVE'] },
          },
          data: {
            status: 'SUPPRESSED',
          },
        });
      }

      // 15. Transitions active outreaches to PAUSED
      if (pcaIds.length > 0) {
        await tx.outreach.updateMany({
          where: {
            personCompanyAssociationId: { in: pcaIds },
            workspaceId,
            status: { in: ['ACTIVE', 'APPROVED'] },
          },
          data: {
            status: 'PAUSED',
          },
        });
      }

      return {
        success: true,
        email: normalizedEmail,
        affectedPcaIds: pcaIds,
      };
    });
  }
}
