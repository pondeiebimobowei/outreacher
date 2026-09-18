import { Injectable, Logger } from '@nestjs/common';
import { JobStatus, Prisma } from '@repo/db';
import {
  AppNotFoundException,
  AppRateLimitException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface DiscoverContactsDto {
  forceRefresh?: boolean;
}

export interface DiscoverContactsResult {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED';
  reused: boolean;
  contactsCount?: number;
}

@Injectable()
export class DiscoverContactsUseCase {
  private readonly logger = new Logger(DiscoverContactsUseCase.name);
  private readonly FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;
  private readonly MAX_FORCED_REFRESHES_PER_24H = 3;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workspaceId: string,
    companyId: string,
    dto?: DiscoverContactsDto,
  ): Promise<DiscoverContactsResult> {
    const forceRefresh = Boolean(dto?.forceRefresh);
    const now = new Date();
    const h24Ago = new Date(now.getTime() - this.FRESHNESS_WINDOW_MS);

    // 1. Verify company existence and workspace ownership
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, workspaceId },
    });

    if (!company) {
      throw new AppNotFoundException(
        `Company ${companyId} not found in workspace.`,
      );
    }

    // 2. Execution-Based 24-Hour Freshness Check (Zero-Result Safe)
    if (!forceRefresh) {
      const recentCompletedJob = await this.prisma.job.findFirst({
        where: {
          workspaceId,
          type: 'CONTACT_DISCOVERY',
          status: JobStatus.COMPLETED,
          completedAt: { gte: h24Ago },
          payload: {
            path: ['companyId'],
            equals: companyId,
          },
        },
        orderBy: { completedAt: 'desc' },
      });

      if (recentCompletedJob) {
        const contactsCount = await this.prisma.contact.count({
          where: { workspaceId, companyId },
        });

        this.logger.log(
          `Fresh contact discovery job ${recentCompletedJob.id} reused for company ${companyId}`,
        );
        return {
          jobId: recentCompletedJob.id,
          status: 'COMPLETED',
          reused: true,
          contactsCount,
        };
      }
    }

    // 3. Atomic Rate Limiting, Active Job Deduplication & Job Enqueueing within DB Transaction
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Row lock company to serialize concurrent requests
      await tx.$executeRaw`
        SELECT id FROM companies 
        WHERE id = ${companyId} AND workspace_id = ${workspaceId} 
        FOR UPDATE
      `;

      // Active Job Deduplication: Check if a job is currently PENDING or RUNNING
      const activeJob = await tx.job.findFirst({
        where: {
          workspaceId,
          type: 'CONTACT_DISCOVERY',
          status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
          payload: {
            path: ['companyId'],
            equals: companyId,
          },
        },
      });

      if (activeJob) {
        this.logger.log(
          `Deduplicating to active contact discovery job ${activeJob.id} for company ${companyId}`,
        );
        return {
          jobId: activeJob.id,
          status: activeJob.status === JobStatus.RUNNING ? 'RUNNING' : 'QUEUED',
          reused: false,
        };
      }

      // Rate Limiting for Forced Refreshes (3 per 24h per workspace per company)
      if (forceRefresh) {
        const forcedCount = await tx.job.count({
          where: {
            workspaceId,
            type: 'CONTACT_DISCOVERY',
            createdAt: { gte: h24Ago },
            payload: {
              path: ['companyId'],
              equals: companyId,
            },
            idempotencyKey: {
              contains: ':force:',
            },
          },
        });

        if (forcedCount >= this.MAX_FORCED_REFRESHES_PER_24H) {
          throw new AppRateLimitException(
            `Maximum ${this.MAX_FORCED_REFRESHES_PER_24H} forced contact discovery refreshes per company per 24 hours reached. Existing contacts remain visible.`,
          );
        }
      }

      // Enqueue new Job
      const idempotencyKey = forceRefresh
        ? `contact-discovery:${workspaceId}:${companyId}:force:${now.getTime()}`
        : `contact-discovery:${workspaceId}:${companyId}`;

      const newJob = await tx.job.create({
        data: {
          workspaceId,
          type: 'CONTACT_DISCOVERY',
          status: JobStatus.PENDING,
          payload: {
            companyId,
            companyName: company.name,
            domain: company.domain ?? undefined,
            industry: company.industry ?? undefined,
            websiteUrl: company.websiteUrl ?? undefined,
            forceRefresh,
          },
          idempotencyKey,
          availableAt: now,
        },
      });

      this.logger.log(
        `Enqueued new contact discovery job ${newJob.id} for company ${companyId}`,
      );

      return {
        jobId: newJob.id,
        status: 'QUEUED',
        reused: false,
      };
    });
  }
}
