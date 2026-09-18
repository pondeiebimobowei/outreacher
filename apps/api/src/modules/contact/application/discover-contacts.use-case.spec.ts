import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@repo/db';
import {
  AppNotFoundException,
  AppRateLimitException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { DiscoverContactsUseCase } from './discover-contacts.use-case';

describe('DiscoverContactsUseCase', () => {
  let useCase: DiscoverContactsUseCase;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: {
        findFirst: jest.fn(),
      },
      job: {
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      contact: {
        count: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscoverContactsUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get<DiscoverContactsUseCase>(DiscoverContactsUseCase);
  });

  it('throws AppNotFoundException if company does not exist in workspace', async () => {
    prisma.company.findFirst.mockResolvedValue(null);

    await expect(useCase.execute('ws-1', 'comp-99')).rejects.toThrow(
      AppNotFoundException,
    );
  });

  it('reuses 24-hour fresh completed discovery job when forceRefresh is false', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
      name: 'Acme',
    });
    prisma.job.findFirst.mockResolvedValue({
      id: 'job-100',
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
    });
    prisma.contact.count.mockResolvedValue(4);

    const result = await useCase.execute('ws-1', 'comp-1', {
      forceRefresh: false,
    });
    expect(result.reused).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.contactsCount).toBe(4);
  });

  it('deduplicates to active PENDING or RUNNING job if present', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
      name: 'Acme',
    });
    prisma.job.findFirst.mockImplementation((args: any) => {
      if (args?.where?.status?.in) {
        return Promise.resolve({ id: 'job-200', status: JobStatus.RUNNING });
      }
      return Promise.resolve(null);
    });

    const result = await useCase.execute('ws-1', 'comp-1', {
      forceRefresh: true,
    });
    expect(result.reused).toBe(false);
    expect(result.jobId).toBe('job-200');
    expect(result.status).toBe('RUNNING');
  });

  it('enforces 3 forced refresh / 24h / workspace limit', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
      name: 'Acme',
    });
    prisma.job.findFirst.mockResolvedValue(null);
    prisma.job.count.mockResolvedValue(3); // Max reached

    await expect(
      useCase.execute('ws-1', 'comp-1', { forceRefresh: true }),
    ).rejects.toThrow(AppRateLimitException);
  });

  it('enqueues new job when under forced refresh rate limit', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
      name: 'Acme',
    });
    prisma.job.findFirst.mockResolvedValue(null);
    prisma.job.count.mockResolvedValue(1);
    prisma.job.create.mockResolvedValue({
      id: 'job-300',
      status: JobStatus.PENDING,
    });

    const result = await useCase.execute('ws-1', 'comp-1', {
      forceRefresh: true,
    });
    expect(result.jobId).toBe('job-300');
    expect(result.status).toBe('QUEUED');
    expect(result.reused).toBe(false);
  });
});
