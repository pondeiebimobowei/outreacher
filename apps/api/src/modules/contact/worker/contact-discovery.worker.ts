import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, JobStatus, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { ContentSanitizer } from '../../research/domain/content-sanitizer';
import { ContactValidator } from '../domain/contact-validator';
import {
  CONTACT_DISCOVERY_PROVIDER_TOKEN,
  ContactDiscoveryProvider,
  ContactDiscoveryResult,
} from '../domain/contact.provider.interface';
import {
  CONTACT_REPOSITORY_TOKEN,
  IContactRepository,
} from '../domain/contact.repository.interface';

export interface ClaimedContactJob {
  job: Job;
  claimedAttempt: number;
}

@Injectable()
export class ContactDiscoveryWorker {
  private readonly logger = new Logger(ContactDiscoveryWorker.name);
  private readonly PROVIDER_TIMEOUT_MS = 30000;
  private readonly STALE_THRESHOLD_MS = 60000;
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTACT_DISCOVERY_PROVIDER_TOKEN)
    private readonly provider: ContactDiscoveryProvider,
    @Inject(CONTACT_REPOSITORY_TOKEN)
    private readonly contactRepository: IContactRepository,
  ) {}

  /**
   * Claims an eligible PENDING contact discovery job using FOR UPDATE SKIP LOCKED.
   * Atomically advances status to RUNNING and increments attemptCount (lease generation).
   */
  async claimNextJob(): Promise<ClaimedContactJob | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const eligibleJobs = await tx.$queryRaw<Array<{ id: string; attempt_count: number }>>`
        SELECT id, attempt_count 
        FROM jobs 
        WHERE type = 'CONTACT_DISCOVERY' 
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

      return {
        job: updatedJob,
        claimedAttempt,
      };
    });
  }

  /**
   * Processes a claimed job outside the DB transaction, then atomically commits
   * results or handles failure conditional on owning the attempt lease.
   */
  async processJob(claimed: ClaimedContactJob): Promise<boolean> {
    const { job, claimedAttempt } = claimed;
    const payload = job.payload as Record<string, unknown> | null;
    const companyId = payload?.companyId as string;
    const workspaceId = job.workspaceId;

    let providerResult: ContactDiscoveryResult | null = null;
    let safeErrorCode: string | null = null;

    try {
      // Fetch target roles from CareerProfile for provider context
      const careerProfile = await this.prisma.careerProfile.findUnique({
        where: { workspaceId },
      });
      const targetRoles = careerProfile?.targetRoles?.filter(Boolean) ?? [];

      providerResult = await this.executeProviderWithTimeout({
        companyId,
        workspaceId,
        companyName: (payload?.companyName as string) || companyId,
        domain: payload?.domain as string | undefined,
        industry: payload?.industry as string | undefined,
        websiteUrl: payload?.websiteUrl as string | undefined,
        targetRoles,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Contact discovery provider failed for job ${job.id}: ${msg}`);
      safeErrorCode = msg.includes('timeout') ? 'PROVIDER_TIMEOUT' : 'PROVIDER_FAILURE';
    }

    // Atomic completion transaction verifying generation lease
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const currentJob = await tx.job.findFirst({
        where: {
          id: job.id,
          status: JobStatus.RUNNING,
          attemptCount: claimedAttempt,
        },
      });

      if (!currentJob) {
        this.logger.warn(`Job ${job.id} lease generation ${claimedAttempt} lost. Aborting completion.`);
        return false;
      }

      if (providerResult) {
        // Sanitize strings & validate/deduplicate candidate records
        const sanitizedCandidates = providerResult.candidates.map((c) => ({
          ...c,
          name: ContentSanitizer.sanitize(c.name),
          title: c.title ? ContentSanitizer.sanitize(c.title) : undefined,
        }));

        const validCandidates = ContactValidator.deduplicateCandidates(sanitizedCandidates);

        // Upsert candidates
        await this.contactRepository.upsertCompanyContacts(
          workspaceId,
          companyId,
          validCandidates.map((c) => ({
            workspaceId,
            companyId,
            contactKind: c.contactKind,
            name: c.name,
            email: c.email,
            title: c.title,
            source: c.source,
            sourceUrl: c.sourceUrl,
            confidence: c.confidence,
            discoveredAt: providerResult!.discoveredAt,
          })),
        );

        // Complete Job, updating payload with mock flag if provider returned mock
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.COMPLETED,
            completedAt: new Date(),
            payload: {
              ...(job.payload as object),
              mock: providerResult.mock === true,
              contactsDiscoveredCount: validCandidates.length,
            },
          },
        });

        return true;
      }

      // Handle Provider Failure / Retry Backoff
      if (claimedAttempt < this.MAX_ATTEMPTS) {
        const backoffSeconds = Math.pow(2, claimedAttempt) * 5;
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.PENDING,
            availableAt: new Date(Date.now() + backoffSeconds * 1000),
            lastError: safeErrorCode ?? 'PROVIDER_FAILURE',
          },
        });
      } else {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.DEAD_LETTER,
            failedAt: new Date(),
            lastError: 'JOB_DEAD_LETTER',
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
        type: 'CONTACT_DISCOVERY',
        status: JobStatus.RUNNING,
        startedAt: { lt: staleTime },
      },
    });

    let reclaimed = 0;

    for (const job of staleJobs) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
          reclaimed++;
        } else {
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: JobStatus.DEAD_LETTER,
              failedAt: new Date(),
              lastError: 'JOB_DEAD_LETTER',
            },
          });
          reclaimed++;
        }
      });
    }

    return reclaimed;
  }

  private async executeProviderWithTimeout(input: any): Promise<ContactDiscoveryResult> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Contact discovery provider execution timeout (30s exceeded)'));
      }, this.PROVIDER_TIMEOUT_MS);
    });

    try {
      return await Promise.race([this.provider.discoverContacts(input), timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }
}
