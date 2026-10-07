import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GenerateDirectOutreachUseCase } from './generate-direct-outreach.use-case';

describe('GenerateDirectOutreachUseCase', () => {
  let useCase: GenerateDirectOutreachUseCase;
  let prisma: any;

  const mockOutreach = {
    id: 'out-123',
    workspaceId: 'ws-1',
    subject: 'Initial Subject',
    message: 'Initial Message',
    personCompanyAssociation: {
      personId: 'per-1',
      companyId: 'cmp-1',
    },
  };

  beforeEach(() => {
    prisma = {
      outreach: {
        findUnique: jest.fn(),
      },
      job: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    useCase = new GenerateDirectOutreachUseCase(prisma);
  });

  it('reuses an existing PENDING or RUNNING OUTREACH_GENERATION job with idempotency key', async () => {
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    prisma.job.findUnique.mockResolvedValue({
      id: 'existing-job-1',
      status: 'PENDING',
    });

    const result = await useCase.execute({
      userId: 'user-1',
      workspaceId: 'ws-1',
      outreachId: 'out-123',
    });

    expect(result).toEqual({ jobId: 'existing-job-1', status: 'QUEUED' });
    expect(prisma.job.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_type_idempotencyKey: {
          workspaceId: 'ws-1',
          type: 'OUTREACH_GENERATION',
          idempotencyKey: 'outreach-direct:out-123:2',
        },
      },
    });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it('creates a new OUTREACH_GENERATION job when none exists', async () => {
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    prisma.job.findUnique.mockResolvedValue(null);
    prisma.job.count.mockResolvedValue(0);
    prisma.job.create.mockResolvedValue({
      id: 'new-job-1',
      status: 'PENDING',
    });

    const result = await useCase.execute({
      userId: 'user-1',
      workspaceId: 'ws-1',
      outreachId: 'out-123',
    });

    expect(result).toEqual({ jobId: 'new-job-1', status: 'QUEUED' });
    expect(prisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        type: 'OUTREACH_GENERATION',
        status: 'PENDING',
        idempotencyKey: 'outreach-direct:out-123:2',
      }),
    });
  });

  it('enforces tenant bounds and throws ForbiddenException on workspace mismatch', async () => {
    prisma.outreach.findUnique.mockResolvedValue({
      ...mockOutreach,
      workspaceId: 'other-ws',
    });

    await expect(
      useCase.execute({
        userId: 'user-1',
        workspaceId: 'ws-1',
        outreachId: 'out-123',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when outreach does not exist', async () => {
    prisma.outreach.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: 'user-1',
        workspaceId: 'ws-1',
        outreachId: 'non-existent',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
