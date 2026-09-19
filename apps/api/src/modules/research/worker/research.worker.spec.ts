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
  });

  describe('recoverStaleJobs', () => {
    it('reclaims stale RUNNING jobs (>60s old) back to PENDING', async () => {
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
  });
});
