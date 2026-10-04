import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, JobStatus, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { ContentSanitizer } from '../../research/domain/content-sanitizer';
import { ContactValidator } from '../domain/contact-validator';
import {
  CONTACT_DISCOVERY_PROVIDER_TOKEN,
  type ContactDiscoveryProvider,
  type ContactDiscoveryResult,
} from '../domain/contact.provider.interface';
import {
  CONTACT_REPOSITORY_TOKEN,
  type IContactRepository,
} from '../domain/contact.repository.interface';
import { ContactDiscoveryProviderException } from '../domain/contact-provider.exception';
import {
  DEFAULT_CONTACT_WORKER_PROVIDER_TIMEOUT_MS,
  DEFAULT_CONTACT_WORKER_STALE_THRESHOLD_MS,
} from '../domain/contact.constants';

export interface ClaimedContactJob {
  job: Job;
  claimedAttempt: number;
}

@Injectable()
export class ContactDiscoveryWorker {
  private readonly logger = new Logger(ContactDiscoveryWorker.name);
  private readonly PROVIDER_TIMEOUT_MS =
    DEFAULT_CONTACT_WORKER_PROVIDER_TIMEOUT_MS;
  private readonly STALE_THRESHOLD_MS =
    DEFAULT_CONTACT_WORKER_STALE_THRESHOLD_MS;
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
      const eligibleJobs = await tx.$queryRaw<
        Array<{ id: string; attempt_count: number }>
      >`
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
    let caughtError: unknown = null;

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
      caughtError = err;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Contact discovery provider failed for job ${job.id}: ${msg}`,
      );
    }

    if (providerResult) {
      // Atomic completion transaction verifying generation lease & maintaining strict lock ordering:
      // Dual-entity transactions acquire row lock on jobs FOR UPDATE FIRST (L_job),
      // then acquire company advisory lock pg_advisory_xact_lock SECOND (L_company).
      return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const lockedJobs = await tx.$queryRaw<
          Array<{ id: string; status: string; attempt_count: number }>
        >`
          SELECT id, status, attempt_count
          FROM jobs
          WHERE id = ${job.id}
          FOR UPDATE
        `;

        const currentJob = lockedJobs[0];
        if (
          !currentJob ||
          currentJob.status !== JobStatus.RUNNING ||
          currentJob.attempt_count !== claimedAttempt
        ) {
          this.logger.warn(
            `Job ${job.id} lease generation ${claimedAttempt} lost. Aborting completion.`,
          );
          return false;
        }

        const sanitizedCandidates = providerResult.candidates.map((c) => ({
          ...c,
          firstName: c.firstName
            ? ContentSanitizer.sanitize(c.firstName)
            : c.firstName,
          lastName: c.lastName
            ? ContentSanitizer.sanitize(c.lastName)
            : c.lastName,
          title: c.title ? ContentSanitizer.sanitize(c.title) : undefined,
        }));

        const validCandidates =
          ContactValidator.deduplicateCandidates(sanitizedCandidates);

        // Persist discovered contacts (acquires company advisory lock SECOND: L_company)
        const persistenceResult =
          await this.contactRepository.persistDiscoveredContacts(
            workspaceId,
            companyId,
            validCandidates,
            tx,
          );

        const currentPayload = (job.payload as Record<string, unknown>) ?? {};
        const unknowns = Array.isArray(currentPayload.unknowns)
          ? [...(currentPayload.unknowns as string[])]
          : [];

        if (persistenceResult.rejectedConflictCount > 0) {
          unknowns.push(
            `person_kind_conflict:${persistenceResult.rejectedConflictCount}`,
          );
        }

        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.COMPLETED,
            completedAt: new Date(),
            payload: {
              ...currentPayload,
              unknowns,
              mock: providerResult.mock === true,
              contactsDiscoveredCount: persistenceResult.acceptedCount,
              rejections:
                persistenceResult.rejectedCandidates as unknown as Prisma.InputJsonValue,
            },
          },
        });

        return true;
      });
    }

    return this.handleFencedJobFailure(job, claimedAttempt, caughtError);
  }

  /**
   * Handles failure with atomic conditional fencing and backoff calculation.
   * If non-retryable or max attempts exceeded -> DEAD_LETTER.
   * If retryable and attempts remaining -> PENDING with exponential backoff.
   */
  private async handleFencedJobFailure(
    job: Job,
    claimedAttempt: number,
    caughtError: unknown,
  ): Promise<boolean> {
    let errorCode = 'PROVIDER_FAILURE';
    let isRetryable = true;

    if (caughtError instanceof ContactDiscoveryProviderException) {
      errorCode = caughtError.code;
      isRetryable = caughtError.retryable;
    } else if (caughtError instanceof Error) {
      if (caughtError.message.includes('timeout')) {
        errorCode = 'PROVIDER_TIMEOUT';
        isRetryable = true;
      }
    }

    const shouldRetry = isRetryable && claimedAttempt < this.MAX_ATTEMPTS;
    const backoffSeconds = Math.pow(2, claimedAttempt) * 5;
    const nextStatus = shouldRetry ? JobStatus.PENDING : JobStatus.DEAD_LETTER;

    const updateResult = await this.prisma.job.updateMany({
      where: {
        id: job.id,
        status: JobStatus.RUNNING,
        attemptCount: claimedAttempt,
      },
      data: {
        status: nextStatus,
        availableAt: shouldRetry
          ? new Date(Date.now() + backoffSeconds * 1000)
          : undefined,
        failedAt: shouldRetry ? undefined : new Date(),
        lastError: errorCode,
      },
    });

    if (updateResult.count === 0) {
      this.logger.warn(
        `Job ${job.id} lease generation ${claimedAttempt} lost during failure handling.`,
      );
      return false;
    }

    return false;
  }

  /**
   * Scans for stale RUNNING jobs (>60s old) and reclaims or dead-letters them
   * using atomic conditional updates.
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
      const shouldRetry = job.attemptCount < this.MAX_ATTEMPTS;
      const nextStatus = shouldRetry ? JobStatus.PENDING : JobStatus.DEAD_LETTER;

      const updateResult = await this.prisma.job.updateMany({
        where: {
          id: job.id,
          status: JobStatus.RUNNING,
          attemptCount: job.attemptCount,
        },
        data: {
          status: nextStatus,
          availableAt: shouldRetry ? new Date() : undefined,
          failedAt: shouldRetry ? undefined : new Date(),
          lastError: shouldRetry
            ? 'STALE_LEASE_RECLAIMED'
            : 'JOB_DEAD_LETTER',
        },
      });

      if (updateResult.count > 0) {
        reclaimed++;
      }
    }

    return reclaimed;
  }

  private async executeProviderWithTimeout(
    input: any,
  ): Promise<ContactDiscoveryResult> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new ContactDiscoveryProviderException(
            `Person discovery provider execution timeout (${this.PROVIDER_TIMEOUT_MS}ms exceeded)`,
            'PROVIDER_TIMEOUT',
            true,
          ),
        );
      }, this.PROVIDER_TIMEOUT_MS);
    });

    try {
      return await Promise.race([
        this.provider.discoverContacts(input),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }
}
