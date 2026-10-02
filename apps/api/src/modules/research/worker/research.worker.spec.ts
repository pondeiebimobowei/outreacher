import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  COMPANY_RESEARCH_PROVIDER_TOKEN,
  CompanyResearchProvider,
} from '../domain/research.provider.interface';
import {
  RESEARCH_REPOSITORY_TOKEN,
  IResearchRepository,
} from '../domain/research.repository.interface';
import { ResearchProviderTimeoutException } from '../domain/research-provider.exception';
import { ResearchWorker } from './research.worker';

/* eslint-disable @typescript-eslint/unbound-method */
describe('ResearchWorker', () => {
  let worker: ResearchWorker;
  let mockPrisma: any;
  let mockProvider: jest.Mocked<CompanyResearchProvider>;
  let mockRepository: jest.Mocked<IResearchRepository>;

  const workspaceId = 'ws-123';
  const companyId = 'comp-456';
  const researchRunId = 'run-789';
  const jobId = 'job-101';

  beforeEach(async () => {
    mockPrisma = {
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      $queryRaw: jest.fn(),
      job: {
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      researchRun: {
        update: jest.fn(),
      },
    };

    mockProvider = {
      researchCompany: jest.fn(),
    };

    mockRepository = {
      startResearch: jest.fn(),
      findLatestRun: jest.fn(),
      findRunById: jest.fn(),
      updateRunStatus: jest.fn(),
      completeResearchRun: jest.fn(),
      findResearchDetails: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchWorker,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: COMPANY_RESEARCH_PROVIDER_TOKEN, useValue: mockProvider },
        { provide: RESEARCH_REPOSITORY_TOKEN, useValue: mockRepository },
      ],
    }).compile();

    worker = module.get<ResearchWorker>(ResearchWorker);
  });

  describe('claimNextJob', () => {
    it('claims next eligible job using SKIP LOCKED and increments attemptCount', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: jobId, attempt_count: 0 }]);
      mockPrisma.job.update.mockResolvedValue({
        id: jobId,
        workspaceId,
        type: 'RESEARCH_COMPANY',
        status: JobStatus.RUNNING,
        attemptCount: 1,
        payload: { researchRunId, companyId },
      });

      const claimed = await worker.claimNextJob();

      expect(claimed).not.toBeNull();
      expect(claimed?.claimedAttempt).toBe(1);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: JobStatus.RUNNING,
            attemptCount: 1,
          }),
        }),
      );
      expect(mockPrisma.researchRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: researchRunId },
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );
    });

    it('returns null if no eligible job is found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const claimed = await worker.claimNextJob();
      expect(claimed).toBeNull();
    });
  });

  describe('processJob', () => {
    it('completes job successfully when lease generation matches', async () => {
      mockRepository.findRunById.mockResolvedValue({
        id: researchRunId,
      } as any);
      mockProvider.researchCompany.mockResolvedValue({
        summary: 'Good summary',
        findings: [],
        sources: [],
        opportunities: [],
        evidence: [],
        unknowns: [],
        status: 'COMPLETED',
      });

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const claimed = {
        job: {
          id: jobId,
          workspaceId,
          payload: { researchRunId, companyId },
        } as any,
        claimedAttempt: 1,
      };

      const success = await worker.processJob(claimed);

      expect(success).toBe(true);
      expect(mockRepository.completeResearchRun).toHaveBeenCalledWith(
        workspaceId,
        researchRunId,
        expect.objectContaining({ summary: 'Good summary' }),
      );
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({ status: JobStatus.COMPLETED }),
        }),
      );
    });

    it('aborts completion if lease generation does not match current job', async () => {
      mockRepository.findRunById.mockResolvedValue({
        id: researchRunId,
      } as any);
      mockProvider.researchCompany.mockResolvedValue({
        summary: 'Good summary',
        findings: [],
        sources: [],
        opportunities: [],
        evidence: [],
        unknowns: [],
        status: 'COMPLETED',
      });

      // Lease generation check returns null (stale worker)
      mockPrisma.job.findFirst.mockResolvedValue(null);

      const claimed = {
        job: {
          id: jobId,
          workspaceId,
          payload: { researchRunId, companyId },
        } as any,
        claimedAttempt: 1,
      };

      const success = await worker.processJob(claimed);

      expect(success).toBe(false);
      expect(mockRepository.completeResearchRun).not.toHaveBeenCalled();
    });

    it('retries job with exponential backoff on provider failure when attempts < max', async () => {
      mockRepository.findRunById.mockResolvedValue({
        id: researchRunId,
      } as any);
      mockProvider.researchCompany.mockRejectedValue(
        new Error('Provider timeout exceeded'),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const claimed = {
        job: {
          id: jobId,
          workspaceId,
          payload: { researchRunId, companyId },
        } as any,
        claimedAttempt: 1,
      };

      const success = await worker.processJob(claimed);

      expect(success).toBe(false);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: JobStatus.PENDING,
            lastError: 'PROVIDER_TIMEOUT',
          }),
        }),
      );
    });

    it('does NOT trigger timeout for normal long-running provider result around 80-120s (e.g. 100s)', async () => {
      jest.useFakeTimers();
      try {
        mockRepository.findRunById.mockResolvedValue({ id: researchRunId } as any);
        mockPrisma.job.findFirst.mockResolvedValue({
          id: jobId,
          status: JobStatus.RUNNING,
          attemptCount: 1,
        });

        let resolveProvider!: (result: any) => void;
        mockProvider.researchCompany.mockReturnValue(
          new Promise((resolve) => {
            resolveProvider = resolve;
          }),
        );

        const claimed = {
          job: { id: jobId, workspaceId, payload: { researchRunId, companyId } } as any,
          claimedAttempt: 1,
        };

        const processPromise = worker.processJob(claimed);

        // Advance timers by 100s (simulating normal 80-120s empirical execution)
        await jest.advanceTimersByTimeAsync(100000);

        // Provider successfully completes at 100s
        resolveProvider({
          summary: 'Completed research within normal duration',
          findings: [],
          sources: [],
          opportunities: [],
          evidence: [],
          unknowns: [],
          status: 'COMPLETED',
        });

        const success = await processPromise;
        expect(success).toBe(true);
        expect(mockRepository.completeResearchRun).toHaveBeenCalledWith(
          workspaceId,
          researchRunId,
          expect.objectContaining({ summary: 'Completed research within normal duration' }),
        );
        expect(mockPrisma.job.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: jobId },
            data: expect.objectContaining({ status: JobStatus.COMPLETED }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('triggers provider timeout when execution exceeds calibrated 150s timeout', async () => {
      jest.useFakeTimers();
      try {
        mockRepository.findRunById.mockResolvedValue({ id: researchRunId } as any);
        mockPrisma.job.findFirst.mockResolvedValue({
          id: jobId,
          status: JobStatus.RUNNING,
          attemptCount: 1,
        });

        mockProvider.researchCompany.mockReturnValue(new Promise(() => {}));

        const claimed = {
          job: { id: jobId, workspaceId, payload: { researchRunId, companyId } } as any,
          claimedAttempt: 1,
        };

        const processPromise = worker.processJob(claimed);

        // Advance timers past calibrated 150,000ms timeout
        await jest.advanceTimersByTimeAsync(150001);

        const success = await processPromise;
        expect(success).toBe(false);
        expect(mockPrisma.job.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: jobId },
            data: expect.objectContaining({
              status: JobStatus.PENDING,
              lastError: 'PROVIDER_TIMEOUT',
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('verifies provider timeout retry lifecycle: attempt 1 times out and reschedules; attempt 2 receives result and commits', async () => {
      mockRepository.findRunById.mockResolvedValue({ id: researchRunId } as any);

      // Attempt 1: Provider call throws ResearchProviderTimeoutException (or times out)
      mockProvider.researchCompany.mockRejectedValueOnce(
        new ResearchProviderTimeoutException('HTTP request timed out after 150000ms'),
      );
      mockPrisma.job.findFirst.mockResolvedValueOnce({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const claimedAttempt1 = {
        job: { id: jobId, workspaceId, payload: { researchRunId, companyId } } as any,
        claimedAttempt: 1,
      };

      const successAttempt1 = await worker.processJob(claimedAttempt1);
      expect(successAttempt1).toBe(false);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: JobStatus.PENDING,
            lastError: 'PROVIDER_TIMEOUT',
          }),
        }),
      );

      // Attempt 2: Job retried with the same researchRunId; Python task registry joins/serves cached result
      const expectedResult = {
        summary: 'Completed research on retry',
        findings: [],
        sources: [],
        opportunities: [],
        evidence: [],
        unknowns: [],
        status: 'COMPLETED' as const,
      };
      mockProvider.researchCompany.mockResolvedValueOnce(expectedResult);
      mockPrisma.job.findFirst.mockResolvedValueOnce({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 2,
      });

      const claimedAttempt2 = {
        job: { id: jobId, workspaceId, payload: { researchRunId, companyId } } as any,
        claimedAttempt: 2,
      };

      const successAttempt2 = await worker.processJob(claimedAttempt2);
      expect(successAttempt2).toBe(true);
      expect(mockRepository.completeResearchRun).toHaveBeenCalledWith(
        workspaceId,
        researchRunId,
        expect.objectContaining({ summary: 'Completed research on retry' }),
      );
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: JobStatus.COMPLETED,
          }),
        }),
      );
    });

    it('moves job to DEAD_LETTER and ResearchRun to FAILED on 3rd failed attempt', async () => {
      mockRepository.findRunById.mockResolvedValue({
        id: researchRunId,
      } as any);
      mockProvider.researchCompany.mockRejectedValue(
        new Error('Provider error'),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 3,
      });

      const claimed = {
        job: {
          id: jobId,
          workspaceId,
          payload: { researchRunId, companyId },
        } as any,
        claimedAttempt: 3,
      };

      const success = await worker.processJob(claimed);

      expect(success).toBe(false);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: JobStatus.DEAD_LETTER,
            lastError: 'JOB_DEAD_LETTER',
          }),
        }),
      );
      expect(mockPrisma.researchRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: researchRunId },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('immediately moves job to DEAD_LETTER on non-retryable provider exception even on 1st attempt', async () => {
      const {
        ResearchProviderPermanentException,
      } = require('../domain/research-provider.exception');

      mockRepository.findRunById.mockResolvedValue({
        id: researchRunId,
      } as any);
      mockProvider.researchCompany.mockRejectedValue(
        new ResearchProviderPermanentException(
          'Company name invalid',
          'INVALID_REQUEST',
        ),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const claimed = {
        job: {
          id: jobId,
          workspaceId,
          payload: { researchRunId, companyId },
        } as any,
        claimedAttempt: 1,
      };

      const success = await worker.processJob(claimed);

      expect(success).toBe(false);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: JobStatus.DEAD_LETTER,
            lastError: 'INVALID_REQUEST',
          }),
        }),
      );
      expect(mockPrisma.researchRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: researchRunId },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });

  describe('recoverStaleJobs', () => {
    it('cannot reclaim a healthy execution running for 80-120s before the 180s stale threshold', async () => {
      mockPrisma.job.findMany.mockImplementation(async (args: any) => {
        const queryStaleTime = args?.where?.startedAt?.lt;
        expect(queryStaleTime).toBeInstanceOf(Date);
        // Verify the threshold passed to DB query is exactly 180,000ms before now
        const diffMs = Date.now() - queryStaleTime.getTime();
        expect(diffMs).toBeGreaterThanOrEqual(179900);
        expect(diffMs).toBeLessThanOrEqual(180100);
        // Healthy executions (<180s old) are not matched
        return [];
      });

      const count = await worker.recoverStaleJobs();
      expect(count).toBe(0);
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });

    it('reclaims stale RUNNING jobs (>180s old) back to PENDING', async () => {
      mockPrisma.job.findMany.mockResolvedValue([
        {
          id: 'job-stale',
          attemptCount: 1,
          payload: { researchRunId, companyId },
        },
      ]);
      mockPrisma.job.findFirst.mockResolvedValue({
        id: 'job-stale',
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const count = await worker.recoverStaleJobs();

      expect(count).toBe(1);
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-stale' },
          data: expect.objectContaining({
            status: JobStatus.PENDING,
            lastError: 'STALE_LEASE_RECLAIMED',
          }),
        }),
      );
    });

    it('proves that a provider execution outliving stale threshold whose lease was reclaimed cannot commit results', async () => {
      // 1. Worker 1 claims job with attemptCount = 1
      const claimed = {
        job: {
          id: jobId,
          workspaceId,
          payload: { researchRunId, companyId },
        } as any,
        claimedAttempt: 1,
      };

      // Set up a deferred provider promise to simulate an active, in-flight long-running execution
      let resolveProvider!: (result: any) => void;
      const pendingProviderPromise = new Promise((resolve) => {
        resolveProvider = resolve;
      });
      mockProvider.researchCompany.mockReturnValue(pendingProviderPromise);

      // 2. Worker 1 starts processing the job (now in-flight)
      const processPromise = worker.processJob(claimed);

      // 3. While Worker 1 is in-flight beyond the stale threshold, recoverStaleJobs reclaims the lease.
      // In the database, the job is no longer RUNNING with attemptCount = 1 (claimed by Worker 2 or reset to PENDING)
      mockPrisma.job.findFirst.mockResolvedValue(null);

      // 4. The provider finally returns results to Worker 1
      resolveProvider({
        summary: 'Delayed summary',
        findings: [],
        sources: [],
        opportunities: [],
        evidence: [],
        unknowns: [],
        status: 'COMPLETED',
      });

      // 5. Worker 1 attempts to finalize its work
      const success = await processPromise;

      // Invariant: late-finishing Worker 1 cannot commit results or overwrite the new lease
      expect(success).toBe(false);
      expect(mockRepository.completeResearchRun).not.toHaveBeenCalled();
      expect(mockPrisma.job.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: JobStatus.COMPLETED }),
        }),
      );
    });
  });
});
