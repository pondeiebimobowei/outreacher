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
      // 1. Fetch Outreach with PCA & Person
      const outreach = await tx.outreach.findFirst({
        where: {
          id: outreachId,
          workspaceId,
        },
        include: {
          personCompanyAssociation: {
            include: { person: true },
          },
        },
      });

      if (!outreach) {
        throw new NotFoundException(
          `Outreach ${outreachId} not found in workspace`,
        );
      }

      // 2. Lock PCA -> Outreach -> EmailSends
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

      // 4. Verify PCA conversationState is not STOPPED
      if (pca.conversationState === 'STOPPED') {
        throw new AppUnprocessableEntityException(
          'Contact is suppressed/stopped',
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

      // 7. Reopen jobs: Reopens CANCELLED(PAUSED) jobs, but STRICTLY REFUSES to reopen CANCELLED(SUPPRESSED)
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

      // 8. Update Outreach status
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
