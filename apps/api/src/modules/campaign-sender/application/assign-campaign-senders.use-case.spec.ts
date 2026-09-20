import { Test, TestingModule } from '@nestjs/testing';
import { AssignCampaignSendersUseCase } from './assign-campaign-senders.use-case';
import { PrismaService } from '../../../database/prisma.service';
import { AppValidationException, AppNotFoundException } from '../../../common/errors/application.exception';
import { AssignmentStatus, CampaignStatus } from '@repo/db';
import { Prisma } from '@repo/db';

describe('AssignCampaignSendersUseCase', () => {
  let useCase: AssignCampaignSendersUseCase;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignCampaignSendersUseCase,
        {
          provide: PrismaService,
          useValue: {
            campaign: { findUnique: jest.fn() },
            senderAccount: { findMany: jest.fn() },
            campaignSenderAccount: {
              updateMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
            $transaction: jest.fn((cb) => cb(prisma)),
          },
        },
      ],
    }).compile();

    useCase = module.get<AssignCampaignSendersUseCase>(AssignCampaignSendersUseCase);
    prisma = module.get<PrismaService>(PrismaService);
  });

  const workspaceId = 'ws-1';
  const campaignId = 'camp-1';

  it('should throw AppNotFoundException if campaign does not exist', async () => {
    jest.spyOn(prisma.campaign, 'findUnique').mockResolvedValue(null);

    await expect(useCase.execute(workspaceId, campaignId, { senderAccountIds: [] }))
      .rejects.toThrow(AppNotFoundException);
  });

  it('should throw AppValidationException if campaign is ARCHIVED', async () => {
    jest.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({ status: 'ARCHIVED' } as any);

    await expect(useCase.execute(workspaceId, campaignId, { senderAccountIds: [] }))
      .rejects.toThrow(AppValidationException);
  });

  it('should throw AppValidationException if campaign is COMPLETED', async () => {
    jest.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({ status: 'COMPLETED' } as any);

    await expect(useCase.execute(workspaceId, campaignId, { senderAccountIds: [] }))
      .rejects.toThrow(AppValidationException);
  });

  it('should throw AppValidationException if provided sender IDs do not belong to the workspace', async () => {
    jest.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({ status: 'ACTIVE' } as any);
    jest.spyOn(prisma.senderAccount, 'findMany').mockResolvedValue([{ id: 'sender-1' }] as any); // Only one found

    await expect(useCase.execute(workspaceId, campaignId, { senderAccountIds: ['sender-1', 'sender-2'] }))
      .rejects.toThrow(AppValidationException);
  });

  it('should successfully assign senders and remove omitted ones', async () => {
    jest.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({ status: 'ACTIVE' } as any);
    jest.spyOn(prisma.senderAccount, 'findMany').mockResolvedValue([{ id: 'sender-1' }, { id: 'sender-2' }] as any);

    const updateManySpy = jest.spyOn(prisma.campaignSenderAccount, 'updateMany').mockResolvedValue({ count: 1 });
    const findFirstSpy = jest.spyOn(prisma.campaignSenderAccount, 'findFirst')
      .mockResolvedValueOnce(null) // sender-1 doesn't exist, will be created
      .mockResolvedValueOnce({ id: 'rel-2', status: 'REMOVED' } as any); // sender-2 exists but removed, will be reactivated

    const createSpy = jest.spyOn(prisma.campaignSenderAccount, 'create').mockResolvedValue({} as any);
    const updateSpy = jest.spyOn(prisma.campaignSenderAccount, 'update').mockResolvedValue({} as any);

    const result = await useCase.execute(workspaceId, campaignId, { senderAccountIds: ['sender-1', 'sender-2'] });

    expect(result).toEqual({ success: true });
    
    // Check old removed
    expect(updateManySpy).toHaveBeenCalledWith({
      where: {
        workspaceId,
        campaignId,
        senderAccountId: { notIn: ['sender-1', 'sender-2'] },
        status: AssignmentStatus.ACTIVE,
      },
      data: { status: AssignmentStatus.REMOVED },
    });

    // Check newly created
    expect(createSpy).toHaveBeenCalledWith({
      data: {
        workspaceId,
        campaignId,
        senderAccountId: 'sender-1',
        status: AssignmentStatus.ACTIVE,
      },
    });

    // Check reactivated
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'rel-2' },
      data: { status: AssignmentStatus.ACTIVE },
    });
  });

  it('should remove all assignments if empty array is passed', async () => {
    jest.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({ status: 'DRAFT' } as any);
    const updateManySpy = jest.spyOn(prisma.campaignSenderAccount, 'updateMany').mockResolvedValue({ count: 1 });

    const result = await useCase.execute(workspaceId, campaignId, { senderAccountIds: [] });

    expect(result).toEqual({ success: true });
    expect(updateManySpy).toHaveBeenCalledWith({
      where: {
        workspaceId,
        campaignId,
        status: AssignmentStatus.ACTIVE,
      },
      data: { status: AssignmentStatus.REMOVED },
    });
  });
});
