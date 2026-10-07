import { Test, TestingModule } from '@nestjs/testing';
import { Job, JobStatus } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  CONTACT_DISCOVERY_PROVIDER_TOKEN,
  ContactDiscoveryProvider,
  ContactDiscoveryResult,
} from '../domain/contact.provider.interface';
import {
  CONTACT_REPOSITORY_TOKEN,
  IContactRepository,
  ContactPersistenceResult,
} from '../domain/contact.repository.interface';
import { ContactDiscoveryProviderException } from '../domain/contact-provider.exception';
import { ContactDiscoveryWorker } from './contact-discovery.worker';

describe('ContactDiscoveryWorker', () => {
  let worker: ContactDiscoveryWorker;
  let mockPrisma: any;
  let mockProvider: jest.Mocked<ContactDiscoveryProvider>;
  let mockRepository: jest.Mocked<IContactRepository>;

  const workspaceId = 'ws-123';
  const companyId = 'comp-456';
  const jobId = 'job-101';

  beforeEach(async () => {
    mockPrisma = {
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      $queryRaw: jest.fn(),
      job: {
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      careerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          targetRoles: ['Engineering', 'Recruiting'],
        }),
      },
    };

    mockProvider = {
      discoverContacts: jest.fn(),
    };

    mockRepository = {
      findCompanyContacts: jest.fn(),
      findContactById: jest.fn(),
      upsertCompanyContacts: jest.fn(),
      persistDiscoveredContacts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactDiscoveryWorker,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CONTACT_DISCOVERY_PROVIDER_TOKEN, useValue: mockProvider },
        { provide: CONTACT_REPOSITORY_TOKEN, useValue: mockRepository },
      ],
    }).compile();

    worker = module.get<ContactDiscoveryWorker>(ContactDiscoveryWorker);
  });

  describe('claimNextJob', () => {
    it('claims next eligible job using SKIP LOCKED and increments attemptCount', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: jobId, attempt_count: 0 }]);
      mockPrisma.job.update.mockResolvedValue({
        id: jobId,
        workspaceId,
        type: 'CONTACT_DISCOVERY',
        status: JobStatus.RUNNING,
        attemptCount: 1,
        payload: { companyId },
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
    });

    it('returns null if no eligible job is found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const claimed = await worker.claimNextJob();

      expect(claimed).toBeNull();
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });
  });

  describe('processJob', () => {
    const baseJob: Job = {
      id: jobId,
      workspaceId,
      type: 'CONTACT_DISCOVERY',
      status: JobStatus.RUNNING,
      attemptCount: 1,
      payload: {
        companyId,
        companyName: 'Acme Corp',
        domain: 'acme.com',
        websiteUrl: 'https://acme.com',
      },
      availableAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      failedAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('persists candidates and records contactsDiscoveredCount = acceptedCount when PERSON_KIND_CONFLICT occurs', async () => {
      const mockResult: ContactDiscoveryResult = {
        companyId,
        workspaceId,
        discoveredAt: new Date(),
        candidates: [
          {
            firstName: 'Alice',
            lastName: 'Smith',
            title: 'CTO',
            email: 'alice@acme.com',
            personKind: 'PERSON',
            confidence: 'HIGH',
            source: 'PUBLIC_WEB',
            sourceUrl: 'https://acme.com/team',
          },
          {
            firstName: 'Bob',
            lastName: 'Jones',
            title: 'VP Eng',
            email: 'bob@acme.com',
            personKind: 'PERSON',
            confidence: 'HIGH',
            source: 'PUBLIC_WEB',
            sourceUrl: 'https://acme.com/team',
          },
          {
            firstName: 'Charlie',
            lastName: 'Brown',
            title: 'Recruiter',
            email: 'charlie@acme.com',
            personKind: 'PERSON',
            confidence: 'HIGH',
            source: 'PUBLIC_WEB',
            sourceUrl: 'https://acme.com/team',
          },
          {
            firstName: 'Diana',
            lastName: 'Prince',
            title: 'Staff Engineer',
            email: 'diana@acme.com',
            personKind: 'PERSON',
            confidence: 'HIGH',
            source: 'PUBLIC_WEB',
            sourceUrl: 'https://acme.com/team',
          },
          {
            firstName: 'Conflict',
            lastName: 'Role',
            title: 'Support',
            email: 'support@acme.com',
            personKind: 'ROLE_ADDRESS',
            confidence: 'HIGH',
            source: 'PUBLIC_WEB',
            sourceUrl: 'https://acme.com/team',
          },
        ],
      };

      mockProvider.discoverContacts.mockResolvedValue(mockResult);

      // Lock query returns matching active job
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: jobId, status: JobStatus.RUNNING, attempt_count: 1 },
      ]);

      // Persistence result reports 4 accepted, 1 conflict rejected
      const persistenceResult: ContactPersistenceResult = {
        acceptedCount: 4,
        rejectedConflictCount: 1,
        persistedAssociations: [],
        rejectedCandidates: [
          {
            candidate: mockResult.candidates[4],
            reason: 'PERSON_KIND_CONFLICT',
            message:
              'Person with email support@acme.com already exists with personKind PERSON',
          },
        ],
        diagnostics: [],
      };
      mockRepository.persistDiscoveredContacts.mockResolvedValue(
        persistenceResult,
      );

      const success = await worker.processJob({
        job: baseJob,
        claimedAttempt: 1,
      });

      expect(success).toBe(true);
      expect(mockRepository.persistDiscoveredContacts).toHaveBeenCalledWith(
        workspaceId,
        companyId,
        expect.any(Array),
        mockPrisma,
      );

      // Prove contactsDiscoveredCount strictly equals persistenceResult.acceptedCount (4, not raw 5)
      expect(mockPrisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: JobStatus.COMPLETED,
            payload: expect.objectContaining({
              contactsDiscoveredCount: 4,
              unknowns: expect.arrayContaining(['person_kind_conflict:1']),
              rejections: persistenceResult.rejectedCandidates,
            }),
          }),
        }),
      );
    });

    it('aborts completion if job lease generation was lost', async () => {
      mockProvider.discoverContacts.mockResolvedValue({
        companyId,
        workspaceId,
        discoveredAt: new Date(),
        candidates: [],
      });

      // Simulation: another worker reclaimed the job or attempt_count was bumped
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: jobId, status: JobStatus.RUNNING, attempt_count: 2 },
      ]);

      const success = await worker.processJob({
        job: baseJob,
        claimedAttempt: 1,
      });

      expect(success).toBe(false);
      expect(mockRepository.persistDiscoveredContacts).not.toHaveBeenCalled();
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });

    it('routes non-retryable provider exception to DEAD_LETTER immediately and commits zero contact rows', async () => {
      mockProvider.discoverContacts.mockRejectedValue(
        new ContactDiscoveryProviderException(
          'Schema validation failure',
          'CONTRACT_SCHEMA_INVALID',
          false,
        ),
      );

      mockPrisma.job.updateMany.mockResolvedValue({ count: 1 });

      const success = await worker.processJob({
        job: baseJob,
        claimedAttempt: 1,
      });

      expect(success).toBe(false);
      expect(mockRepository.persistDiscoveredContacts).not.toHaveBeenCalled();
      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: {
          id: jobId,
          status: JobStatus.RUNNING,
          attemptCount: 1,
        },
        data: expect.objectContaining({
          status: JobStatus.DEAD_LETTER,
          lastError: 'CONTRACT_SCHEMA_INVALID',
        }),
      });
    });

    it('routes retryable provider exception to PENDING with exponential backoff on attempt 1', async () => {
      mockProvider.discoverContacts.mockRejectedValue(
        new ContactDiscoveryProviderException(
          'Provider gateway timeout',
          'PROVIDER_TIMEOUT',
          true,
        ),
      );

      mockPrisma.job.updateMany.mockResolvedValue({ count: 1 });

      const success = await worker.processJob({
        job: baseJob,
        claimedAttempt: 1,
      });

      expect(success).toBe(false);
      expect(mockRepository.persistDiscoveredContacts).not.toHaveBeenCalled();
      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: {
          id: jobId,
          status: JobStatus.RUNNING,
          attemptCount: 1,
        },
        data: expect.objectContaining({
          status: JobStatus.PENDING,
          lastError: 'PROVIDER_TIMEOUT',
          availableAt: expect.any(Date),
        }),
      });
    });

    it('routes retryable provider exception to DEAD_LETTER when max attempts reached', async () => {
      mockProvider.discoverContacts.mockRejectedValue(
        new ContactDiscoveryProviderException(
          'Network connection refused',
          'NETWORK_ERROR',
          true,
        ),
      );

      mockPrisma.job.updateMany.mockResolvedValue({ count: 1 });

      const success = await worker.processJob({
        job: { ...baseJob, attemptCount: 3 },
        claimedAttempt: 3,
      });

      expect(success).toBe(false);
      expect(mockRepository.persistDiscoveredContacts).not.toHaveBeenCalled();
      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: {
          id: jobId,
          status: JobStatus.RUNNING,
          attemptCount: 3,
        },
        data: expect.objectContaining({
          status: JobStatus.DEAD_LETTER,
          lastError: 'NETWORK_ERROR',
        }),
      });
    });
  });

  describe('recoverStaleJobs', () => {
    it('reclaims stale jobs with attemptCount < MAX_ATTEMPTS using atomic conditional update', async () => {
      mockPrisma.job.findMany.mockResolvedValue([
        { id: 'job-1', attemptCount: 1 },
        { id: 'job-2', attemptCount: 3 },
      ]);
      mockPrisma.job.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      const reclaimed = await worker.recoverStaleJobs();

      expect(reclaimed).toBe(2);
      expect(mockPrisma.job.updateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 'job-1', status: JobStatus.RUNNING, attemptCount: 1 },
          data: expect.objectContaining({
            status: JobStatus.PENDING,
            lastError: 'STALE_LEASE_RECLAIMED',
          }),
        }),
      );
      expect(mockPrisma.job.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: 'job-2', status: JobStatus.RUNNING, attemptCount: 3 },
          data: expect.objectContaining({
            status: JobStatus.DEAD_LETTER,
            lastError: 'JOB_DEAD_LETTER',
          }),
        }),
      );
    });
  });
});
