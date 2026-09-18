import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AIRateLimitException } from '../domain/ai-provider.interface';
import { Prisma } from '@repo/db';

export interface GenerateOutreachCommand {
  userId: string;
  workspaceId: string;
  campaignContactId: string;
}

export interface GenerateOutreachResult {
  jobId: string;
  status: string;
}

export interface OutreachGenerationJobPayload {
  userId: string;
  workspaceId: string;
  campaignContactId: string;
  contactId: string;
  companyId: string;
  draftVersion: number;
}

@Injectable()
export class GenerateOutreachUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(
    command: GenerateOutreachCommand,
  ): Promise<GenerateOutreachResult> {
    const { userId, workspaceId, campaignContactId } = command;

    // 1. Verify CampaignContact exists and enforce tenant isolation
    const campaignContact = await this.prisma.campaignContact.findUnique({
      where: { id: campaignContactId },
      include: { campaign: true },
    });

    if (!campaignContact) {
      throw new NotFoundException(
        `CampaignContact ${campaignContactId} not found`,
      );
    }

    if (campaignContact.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-tenant access prohibited');
    }

    // Determine draft version (1 if initial, or incremented if regeneration requested)
    const draftVersion =
      campaignContact.currentSubject || campaignContact.currentBody ? 2 : 1;
    const idempotencyKey = `outreach:${campaignContactId}:${draftVersion}`;

    // 2. Concurrency-safe atomic rate-limit check per (user + workspace) and job reservation/enqueueing inside DB transaction
    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Check if job with exact idempotency key is already PENDING or RUNNING
        const existingJob = await tx.job.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId,
              idempotencyKey,
            },
          },
        });

        if (
          existingJob &&
          (existingJob.status === 'PENDING' || existingJob.status === 'RUNNING')
        ) {
          return { jobId: existingJob.id, status: 'QUEUED' };
        }

        // Count generation calls in the past 1 hour for this SPECIFIC user within this workspace
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentJobCount = await tx.job.count({
          where: {
            workspaceId,
            type: 'OUTREACH_GENERATION',
            createdAt: { gte: oneHourAgo },
            payload: {
              path: ['userId'],
              equals: userId,
            },
          },
        });

        if (recentJobCount >= 20) {
          throw new AIRateLimitException(
            'AI generation limit reached (max 20 calls per user/workspace per hour)',
          );
        }

        // Enqueue job atomically with userId in payload
        const job = await tx.job.create({
          data: {
            workspaceId,
            type: 'OUTREACH_GENERATION',
            status: 'PENDING',
            idempotencyKey,
            payload: {
              userId,
              workspaceId,
              campaignContactId,
              contactId: campaignContact.contactId,
              companyId: campaignContact.campaign.companyId,
              draftVersion,
            },
          },
        });

        return { jobId: job.id, status: 'QUEUED' };
      },
    );

    return result;
  }
}
