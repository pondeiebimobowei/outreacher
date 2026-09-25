import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AIRateLimitException } from '../domain/ai-provider.interface';
import { Prisma } from '@repo/db';

export interface GenerateDirectOutreachCommand {
  userId: string;
  workspaceId: string;
  outreachId: string;
}

@Injectable()
export class GenerateDirectOutreachUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(command: GenerateDirectOutreachCommand) {
    const { userId, workspaceId, outreachId } = command;

    const outreach = await this.prisma.outreach.findUnique({
      where: { id: outreachId },
      include: { personCompanyAssociation: true },
    });

    if (!outreach) {
      throw new NotFoundException(`Outreach ${outreachId} not found`);
    }

    if (outreach.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-tenant access prohibited');
    }

    const draftVersion = outreach.subject || outreach.message ? 2 : 1;
    const idempotencyKey = `outreach-direct:${outreachId}:${draftVersion}`;

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const existingJob = await tx.job.findUnique({
          where: {
            workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
          },
        });

        if (
          existingJob &&
          (existingJob.status === 'PENDING' || existingJob.status === 'RUNNING')
        ) {
          return { jobId: existingJob.id, status: 'QUEUED' };
        }

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentJobCount = await tx.job.count({
          where: {
            workspaceId,
            type: 'OUTREACH_GENERATION',
            createdAt: { gte: oneHourAgo },
            payload: { path: ['userId'], equals: userId },
          },
        });

        if (recentJobCount >= 20) {
          throw new AIRateLimitException('AI generation limit reached');
        }

        const job = await tx.job.create({
          data: {
            workspaceId,
            type: 'OUTREACH_GENERATION',
            status: 'PENDING',
            idempotencyKey,
            payload: {
              userId,
              workspaceId,
              outreachId,
              personId: outreach.personCompanyAssociation.personId,
              companyId: outreach.personCompanyAssociation.companyId,
              draftVersion,
            },
          },
        });

        return { jobId: job.id, status: 'QUEUED' };
      },
    );
  }
}
