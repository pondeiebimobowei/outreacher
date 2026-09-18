import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, JobStatus, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { ContentSanitizer } from '../domain/content-sanitizer';
import {
  COMPANY_RESEARCH_PROVIDER_TOKEN,
  type CompanyResearchProvider,
  CompanyResearchResult,
} from '../domain/research.provider.interface';
import {
  type IResearchRepository,
  RESEARCH_REPOSITORY_TOKEN,
} from '../domain/research.repository.interface';

export interface ClaimedJob {
  job: Job;
  claimedAttempt: number;
}

@Injectable()
export class ResearchWorker {
  private readonly logger = new Logger(ResearchWorker.name);
  private readonly PROVIDER_TIMEOUT_MS = 30000;
  private readonly STALE_THRESHOLD_MS = 60000;
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(COMPANY_RESEARCH_PROVIDER_TOKEN)
    private readonly researchProvider: CompanyResearchProvider,
    @Inject(RESEARCH_REPOSITORY_TOKEN)
    private readonly researchRepository: IResearchRepository,
  ) {}

  /**
   * Claims an eligible PENDING research job using FOR UPDATE SKIP LOCKED.
   * Atomically advances Job status to RUNNING and increments attemptCount (lease generation).
   */
  async claimNextJob(): Promise<ClaimedJob | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find and lock next eligible job
      const now = new Date();
      const eligibleJobs = await tx.$queryRaw<
        Array<{ id: string; attempt_count: number }>
      >`
        SELECT id, attempt_count 
        from jobs 
        WHERE type = 'RESEARCH_COMPANY' 
          AND status = 'PENDING'
          AND available_at <= ${now}
        ORDER BY available_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (!eligibleJobs || eligibleJobs.length === 0) {
        return null;
      }

      const jobId = eligibleJobs[0].id;
      const claimedAttempt = eligibleJobs[0].attempt_count + 1;

      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.RUNNING,
          attemptCount: claimedAttempt,
          startedAt: now,
        },
      });

      const payload = updatedJob.payload as Record<string, unknown> | null;
      const researchRunId = payload?.researchRunId as string | undefined;

      if (researchRunId) {
        await tx.researchRun.update({
          where: { id: researchRunId },
          data: {
            status: 'RUNNING',
            startedAt: now,
          },
        });
      }

      return {
        job: updatedJob,
        claimedAttempt,
      };
    });
  }

  /**
   * Executes background processing for a claimed job outside the DB transaction,
   * then atomically commits results or handles failure in a single transaction.
   */
  async processJob(claimed: ClaimedJob): Promise<boolean> {
    const { job, claimedAttempt } = claimed;
    const payload = job.payload as Record<string, unknown> | null;
    const researchRunId = payload?.researchRunId as string;
    const companyId = payload?.companyId as string;
    const workspaceId = job.workspaceId;

    let providerResult: CompanyResearchResult | null = null;
    let safeErrorCode: string | null = null;

    try {
      // Fetch company record to provide context to provider
      const company = await this.prisma.company.findFirst({
        where: { id: companyId, workspaceId },
      });

      // Invoke provider with 30s timeout outside DB transaction
      providerResult = await this.executeProviderWithTimeout({
        companyId,
        workspaceId,
        companyName: company?.name || 'Target Company',
        websiteUrl: company?.websiteUrl ?? undefined,
        domain: company?.domain ?? undefined,
        industry: company?.industry ?? undefined,
      });
    } catch (error: any) {
      this.logger.error(
        `Research provider failed for job ${job.id}: ${error?.message}`,
      );
      safeErrorCode = error?.message?.includes('timeout')
        ? 'PROVIDER_TIMEOUT'
        : 'PROVIDER_FAILURE';
    }

    // Atomic completion transaction checking lease generation
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lease generation verification
      const currentJob = await tx.job.findFirst({
        where: {
          id: job.id,
          status: JobStatus.RUNNING,
          attemptCount: claimedAttempt,
        },
      });

      if (!currentJob) {
        this.logger.warn(
          `Job ${job.id} lease generation ${claimedAttempt} lost or reclaimed. Aborting completion.`,
        );
        return false;
      }

      if (providerResult) {
        // Sanitize output
        const sanitizedResult: CompanyResearchResult = {
          ...providerResult,
          summary: ContentSanitizer.sanitize(providerResult.summary),
          findings: providerResult.findings.map((f) => ({
            ...f,
            title: ContentSanitizer.sanitize(f.title),
            detail: ContentSanitizer.sanitize(f.detail),
            whyItMatters: f.whyItMatters
              ? ContentSanitizer.sanitize(f.whyItMatters)
              : undefined,
          })),
          evidence: providerResult.evidence.map((e) => ({
            ...e,
            claim: ContentSanitizer.sanitize(e.claim),
            sourceExcerpt: e.sourceExcerpt
              ? ContentSanitizer.sanitize(e.sourceExcerpt)
              : undefined,
          })),
        };

        // Reconcile and save research
        await this.researchRepository.completeResearchRun(
          workspaceId,
          researchRunId,
          sanitizedResult,
        );

        // Complete Job
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        return true;
      }

      // Handle Provider Failure / Timeout
      if (claimedAttempt < this.MAX_ATTEMPTS) {
        const backoffSeconds = Math.pow(2, claimedAttempt) * 5;
        const availableAt = new Date(Date.now() + backoffSeconds * 1000);

        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.PENDING,
            availableAt,
            lastError: safeErrorCode ?? 'PROVIDER_FAILURE',
          },
        });
      } else {
        // Max attempts reached -> DEAD_LETTER & ResearchRun FAILED
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.DEAD_LETTER,
            failedAt: new Date(),
            lastError: 'JOB_DEAD_LETTER',
          },
        });

        await tx.researchRun.update({
          where: { id: researchRunId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
          },
        });
      }

      return false;
    });
  }

  /**
   * Scans for stale RUNNING jobs (>60s old) and reclaims or dead-letters them.
   */
  async recoverStaleJobs(): Promise<number> {
    const staleTime = new Date(Date.now() - this.STALE_THRESHOLD_MS);

    const staleJobs = await this.prisma.job.findMany({
      where: {
        type: 'RESEARCH_COMPANY',
        status: JobStatus.RUNNING,
        startedAt: { lt: staleTime },
      },
    });

    let reclaimedCount = 0;

    for (const job of staleJobs) {
      const payload = job.payload as Record<string, unknown> | null;
      const researchRunId = payload?.researchRunId as string | undefined;

      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Verify job is still RUNNING
        const current = await tx.job.findFirst({
          where: { id: job.id, status: JobStatus.RUNNING },
        });

        if (!current) return;

        if (current.attemptCount < this.MAX_ATTEMPTS) {
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: JobStatus.PENDING,
              availableAt: new Date(),
              lastError: 'STALE_LEASE_RECLAIMED',
            },
          });
          reclaimedCount++;
        } else {
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: JobStatus.DEAD_LETTER,
              failedAt: new Date(),
              lastError: 'JOB_DEAD_LETTER',
            },
          });

          if (researchRunId) {
            await tx.researchRun.update({
              where: { id: researchRunId },
              data: {
                status: 'FAILED',
                completedAt: new Date(),
              },
            });
          }
          reclaimedCount++;
        }
      });
    }

    return reclaimedCount;
  }

  private async executeProviderWithTimeout(
    input: any,
  ): Promise<CompanyResearchResult> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Research provider execution timeout (30s exceeded)'));
      }, this.PROVIDER_TIMEOUT_MS);
    });

    try {
      return await Promise.race([
        this.researchProvider.researchCompany(input),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }
}
