import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { GenerateOutreachUseCase } from './generate-outreach.use-case';
import { PrismaService } from '../../../database/prisma.service';
import { AIRateLimitException } from '../domain/ai-provider.interface';

describe('GenerateOutreachUseCase', () => {
  let useCase: GenerateOutreachUseCase;
  let prisma: any;

  const mockCampaignContact = {
    id: 'cc-123',
    workspaceId: 'ws-123',
    contactId: 'cnt-123',
    campaignId: 'cmp-123',
    currentSubject: null,
    currentBody: null,
    campaign: {
      companyId: 'company-123',
    },
  };

  beforeEach(async () => {
    prisma = {
      campaignContact: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
      job: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerateOutreachUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get<GenerateOutreachUseCase>(GenerateOutreachUseCase);
  });

  it('enqueues OUTREACH_GENERATION job with userId in payload and returns jobId', async () => {
    prisma.campaignContact.findUnique.mockResolvedValue(mockCampaignContact);
    prisma.job.findUnique.mockResolvedValue(null);
    prisma.job.count.mockResolvedValue(5);
    prisma.job.create.mockResolvedValue({ id: 'job-999', status: 'PENDING' });

    const result = await useCase.execute({
      userId: 'usr-123',
      workspaceId: 'ws-123',
      campaignContactId: 'cc-123',
    });

    expect(result).toEqual({ jobId: 'job-999', status: 'QUEUED' });
    expect(prisma.job.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-123',
        type: 'OUTREACH_GENERATION',
        status: 'PENDING',
        idempotencyKey: 'outreach:cc-123:1',
        payload: {
          userId: 'usr-123',
          workspaceId: 'ws-123',
          campaignContactId: 'cc-123',
          contactId: 'cnt-123',
          companyId: 'company-123',
          draftVersion: 1,
        },
      },
    });
  });

  it('throws NotFoundException if CampaignContact does not exist', async () => {
    prisma.campaignContact.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: 'usr-123',
        workspaceId: 'ws-123',
        campaignContactId: 'cc-nonexistent',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException on cross-tenant access', async () => {
    prisma.campaignContact.findUnique.mockResolvedValue({
      ...mockCampaignContact,
      workspaceId: 'ws-OTHER',
    });

    await expect(
      useCase.execute({
        userId: 'usr-123',
        workspaceId: 'ws-123',
        campaignContactId: 'cc-123',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns existing jobId without enqueuing duplicate for active idempotent job', async () => {
    prisma.campaignContact.findUnique.mockResolvedValue(mockCampaignContact);
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-existing',
      status: 'RUNNING',
    });

    const result = await useCase.execute({
      userId: 'usr-123',
      workspaceId: 'ws-123',
      campaignContactId: 'cc-123',
    });

    expect(result).toEqual({ jobId: 'job-existing', status: 'QUEUED' });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it('throws AIRateLimitException when 20 calls/hr quota is exceeded for specific user', async () => {
    prisma.campaignContact.findUnique.mockResolvedValue(mockCampaignContact);
    prisma.job.findUnique.mockResolvedValue(null);
    prisma.job.count.mockResolvedValue(20);

    await expect(
      useCase.execute({
        userId: 'usr-123',
        workspaceId: 'ws-123',
        campaignContactId: 'cc-123',
      }),
    ).rejects.toThrow(AIRateLimitException);

    expect(prisma.job.count).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-123',
        type: 'OUTREACH_GENERATION',
        createdAt: { gte: expect.any(Date) },
        payload: {
          path: ['userId'],
          equals: 'usr-123',
        },
      },
    });
  });
});
