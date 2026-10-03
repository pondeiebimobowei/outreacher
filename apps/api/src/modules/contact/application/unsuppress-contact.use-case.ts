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

export interface UnsuppressContactResult {
  success: boolean;
  email: string;
  affectedPcaIds: string[];
}

@Injectable()
export class UnsuppressContactUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workspaceId: string,
    contactId: string,
    userId?: string,
    reason?: SuppressionReason,
    notes?: string,
  ): Promise<UnsuppressContactResult> {
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
          `Contact ${contactId} has no associated email to unsuppress`,
        );
      }

      const normalizedEmail = email.trim().toLowerCase();

      // 2. Remove active record from Suppression table
      const suppression = await tx.suppression.findUnique({
        where: {
          workspaceId_email: {
            workspaceId,
            email: normalizedEmail,
          },
        },
      });

      if (suppression) {
        await tx.suppression.delete({
          where: {
            workspaceId_email: {
              workspaceId,
              email: normalizedEmail,
            },
          },
        });
      }

      // 3. Append-only audit record in SuppressionHistory
      await tx.suppressionHistory.create({
        data: {
          workspaceId,
          email: normalizedEmail,
          action: SuppressionAction.UNSUPPRESSED,
          reason: reason || SuppressionReason.MANUAL,
          source: 'USER_ACTION',
          notes: notes || null,
          actorUserId: userId || null,
        },
      });

      // 4. Find all matching STOPPED PCAs in workspace
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
        select: { id: true, conversationState: true },
      });

      const stoppedPcaIds = matchingPcas
        .filter((p) => p.conversationState === 'STOPPED')
        .map((p) => p.id)
        .sort();

      // 5. Lock stopped PCAs (id ASC FOR UPDATE)
      if (stoppedPcaIds.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM person_company_associations
          WHERE id IN (${Prisma.join(stoppedPcaIds)})
          ORDER BY id ASC
          FOR UPDATE
        `;
      }

      // 6. Transition STOPPED -> NO_REPLY with stateVersion++
      if (stoppedPcaIds.length > 0) {
        await tx.personCompanyAssociation.updateMany({
          where: { id: { in: stoppedPcaIds } },
          data: {
            conversationState: 'NO_REPLY',
            stateVersion: { increment: 1 },
          },
        });
      }

      // Safety Invariant:
      // - NEVER sends an email.
      // - NEVER automatically reactivates automation.
      // - NEVER automatically reopens previously suppression-cancelled Jobs.
      // - Leaves CampaignRecipient in SUPPRESSED.
      // - Leaves Outreach in PAUSED.

      return {
        success: true,
        email: normalizedEmail,
        affectedPcaIds: stoppedPcaIds,
      };
    });
  }
}
