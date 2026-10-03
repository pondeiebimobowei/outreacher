import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OutcomeType, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';

const OPEN_OUTREACH_STATUSES = [
  'DRAFT',
  'APPROVED',
  'SENDING',
  'ACTIVE',
  'PAUSED',
] as const;

@Injectable()
export class RecordUserOutcomeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    outreachId: string,
    workspaceId: string,
    userId: string,
    outcomeType: OutcomeType,
    notes?: string,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Fetch Outreach to verify existence and workspace boundary
      const outreach = await tx.outreach.findFirst({
        where: {
          id: outreachId,
          workspaceId,
        },
      });

      if (!outreach) {
        throw new NotFoundException(
          'Outreach not found in caller workspace',
        );
      }

      // 2. Global Lock Order: Lock PCA (FOR UPDATE) -> Lock Outreach (FOR UPDATE)
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

      // 3. Check Outcome Uniqueness (strictly ONE outcome per Outreach)
      const existingOutcome = await tx.outcome.findUnique({
        where: { outreachId },
      });

      if (existingOutcome) {
        throw new ConflictException(
          'Outcome already recorded for this outreach',
        );
      }

      // 4. INSERT Outcome
      const outcome = await tx.outcome.create({
        data: {
          workspaceId,
          outreachId,
          recordedByUserId: userId,
          type: outcomeType,
          notes: notes || null,
        },
      });

      // 5. UPDATE Outreach -> COMPLETED
      await tx.outreach.update({
        where: { id: outreachId },
        data: { status: 'COMPLETED' },
      });

      // 6. PCA Release Semantics & Non-Blocking Terminal States
      const pca = await tx.personCompanyAssociation.findUnique({
        where: { id: outreach.personCompanyAssociationId },
      });

      if (pca && pca.conversationState === 'ACTIVE') {
        // Query remaining open Outreaches (DRAFT, APPROVED, SENDING, ACTIVE, PAUSED)
        // Terminal states (COMPLETED, FAILED, CANCELLED) are non-blocking
        const openOutreachesCount = await tx.outreach.count({
          where: {
            personCompanyAssociationId: outreach.personCompanyAssociationId,
            workspaceId,
            id: { not: outreachId }, // exclude this now-completed outreach
            status: { in: [...OPEN_OUTREACH_STATUSES] },
          },
        });

        if (openOutreachesCount === 0) {
          await tx.personCompanyAssociation.update({
            where: { id: pca.id },
            data: {
              conversationState: 'NO_REPLY',
              stateVersion: { increment: 1 },
            },
          });
        }
      }
      // If PCA is REPLIED, recording an Outcome NEVER erases the reply (conversationState remains REPLIED)

      return outcome.id;
    });
  }
}
