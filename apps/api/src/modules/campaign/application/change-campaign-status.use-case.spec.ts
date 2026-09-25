/* eslint-disable @typescript-eslint/unbound-method */
import {
  AppConflictException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import { ICampaignRepository } from '../domain/campaign.repository.interface';
import { ChangeCampaignStatusUseCase } from './change-campaign-status.use-case';
import { Campaign, CampaignStatus } from '@repo/db';

const workspaceId = 'ws-001';
const otherWorkspaceId = 'ws-other';
const companyId = 'co-001';
const campaignId = 'camp-001';

const mockCampaign = (status: CampaignStatus): Campaign => ({
  id: campaignId,
  workspaceId,
  companyId,
  name: 'Lifecycle Test Campaign',
  status,
  senderAccountId: 'sender-account-id',
  templateId: 'email-template-id',
  followUpDelayBusinessDays: 4,
  createdAt: new Date(),
  updatedAt: new Date(),
  normalizedName: 'test-camp',
});

describe('ChangeCampaignStatusUseCase', () => {
  let useCase: ChangeCampaignStatusUseCase;
  let campaignRepo: jest.Mocked<ICampaignRepository>;

  beforeEach(() => {
    campaignRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findManyByWorkspace: jest.fn(),
      findByNormalizedName: jest.fn(),
      updateStatus: jest.fn(),
      findExistingContactBindings: jest.fn(),
      createContactBindings: jest.fn(),
    };
    useCase = new ChangeCampaignStatusUseCase(campaignRepo);
  });

  describe('pause (ACTIVE -> PAUSED)', () => {
    it('successfully transitions an ACTIVE campaign to PAUSED', async () => {
      campaignRepo.findById.mockResolvedValue(mockCampaign('ACTIVE'));
      campaignRepo.updateStatus.mockResolvedValue(mockCampaign('PAUSED'));

      const result = await useCase.pause(workspaceId, campaignId);

      expect(campaignRepo.findById).toHaveBeenCalledWith(
        workspaceId,
        campaignId,
      );
      expect(campaignRepo.updateStatus).toHaveBeenCalledWith(
        workspaceId,
        campaignId,
        'PAUSED',
      );
      expect(result.status).toBe('PAUSED');
    });

    it.each([
      'DRAFT',
      'PAUSED',
      'SCHEDULED',
      'COMPLETED',
      'ARCHIVED',
    ] as CampaignStatus[])(
      'throws AppConflictException when attempting to pause campaign with status %s',
      async (status) => {
        campaignRepo.findById.mockResolvedValue(mockCampaign(status));

        await expect(useCase.pause(workspaceId, campaignId)).rejects.toThrow(
          AppConflictException,
        );
        expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
      },
    );

    it('throws AppNotFoundException when campaign does not exist in workspace', async () => {
      campaignRepo.findById.mockResolvedValue(null);

      await expect(useCase.pause(workspaceId, campaignId)).rejects.toThrow(
        AppNotFoundException,
      );
      expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws AppNotFoundException on cross-tenant access (non-enumerating)', async () => {
      campaignRepo.findById.mockResolvedValue(null);

      await expect(useCase.pause(otherWorkspaceId, campaignId)).rejects.toThrow(
        AppNotFoundException,
      );
      expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('resume (PAUSED -> ACTIVE)', () => {
    it('successfully transitions a PAUSED campaign to ACTIVE', async () => {
      campaignRepo.findById.mockResolvedValue(mockCampaign('PAUSED'));
      campaignRepo.updateStatus.mockResolvedValue(mockCampaign('ACTIVE'));

      const result = await useCase.resume(workspaceId, campaignId);

      expect(campaignRepo.findById).toHaveBeenCalledWith(
        workspaceId,
        campaignId,
      );
      expect(campaignRepo.updateStatus).toHaveBeenCalledWith(
        workspaceId,
        campaignId,
        'ACTIVE',
      );
      expect(result.status).toBe('ACTIVE');
    });

    it.each([
      'DRAFT',
      'ACTIVE',
      'SCHEDULED',
      'COMPLETED',
      'ARCHIVED',
    ] as CampaignStatus[])(
      'throws AppConflictException when attempting to resume campaign with status %s',
      async (status) => {
        campaignRepo.findById.mockResolvedValue(mockCampaign(status));

        await expect(useCase.resume(workspaceId, campaignId)).rejects.toThrow(
          AppConflictException,
        );
        expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
      },
    );

    it('specifically rejects DRAFT -> ACTIVE (activation owned by BL-014 dispatch)', async () => {
      campaignRepo.findById.mockResolvedValue(mockCampaign('DRAFT'));

      await expect(useCase.resume(workspaceId, campaignId)).rejects.toThrow(
        AppConflictException,
      );
      expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws AppNotFoundException when campaign does not exist in workspace', async () => {
      campaignRepo.findById.mockResolvedValue(null);

      await expect(useCase.resume(workspaceId, campaignId)).rejects.toThrow(
        AppNotFoundException,
      );
      expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws AppNotFoundException on cross-tenant access (non-enumerating)', async () => {
      campaignRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.resume(otherWorkspaceId, campaignId),
      ).rejects.toThrow(AppNotFoundException);
      expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('archive (ANY -> ARCHIVED)', () => {
    it.each([
      'DRAFT',
      'ACTIVE',
      'PAUSED',
      'SCHEDULED',
      'COMPLETED',
    ] as CampaignStatus[])(
      'successfully archives a campaign currently in %s status',
      async (status) => {
        campaignRepo.findById.mockResolvedValue(mockCampaign(status));
        campaignRepo.updateStatus.mockResolvedValue(mockCampaign('ARCHIVED'));

        const result = await useCase.archive(workspaceId, campaignId);

        expect(campaignRepo.findById).toHaveBeenCalledWith(
          workspaceId,
          campaignId,
        );
        expect(campaignRepo.updateStatus).toHaveBeenCalledWith(
          workspaceId,
          campaignId,
          'ARCHIVED',
        );
        expect(result.status).toBe('ARCHIVED');
      },
    );

    it('throws AppConflictException when campaign is already ARCHIVED (terminal state)', async () => {
      campaignRepo.findById.mockResolvedValue(mockCampaign('ARCHIVED'));

      await expect(useCase.archive(workspaceId, campaignId)).rejects.toThrow(
        AppConflictException,
      );
      expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws AppNotFoundException when campaign does not exist in workspace', async () => {
      campaignRepo.findById.mockResolvedValue(null);

      await expect(useCase.archive(workspaceId, campaignId)).rejects.toThrow(
        AppNotFoundException,
      );
      expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws AppNotFoundException on cross-tenant access (non-enumerating)', async () => {
      campaignRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.archive(otherWorkspaceId, campaignId),
      ).rejects.toThrow(AppNotFoundException);
      expect(campaignRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('execute (action dispatcher)', () => {
    it('dispatches PAUSE action to pause method', async () => {
      campaignRepo.findById.mockResolvedValue(mockCampaign('ACTIVE'));
      campaignRepo.updateStatus.mockResolvedValue(mockCampaign('PAUSED'));

      const result = await useCase.execute(workspaceId, campaignId, 'PAUSE');
      expect(result.status).toBe('PAUSED');
    });

    it('dispatches RESUME action to resume method', async () => {
      campaignRepo.findById.mockResolvedValue(mockCampaign('PAUSED'));
      campaignRepo.updateStatus.mockResolvedValue(mockCampaign('ACTIVE'));

      const result = await useCase.execute(workspaceId, campaignId, 'RESUME');
      expect(result.status).toBe('ACTIVE');
    });

    it('dispatches ARCHIVE action to archive method', async () => {
      campaignRepo.findById.mockResolvedValue(mockCampaign('DRAFT'));
      campaignRepo.updateStatus.mockResolvedValue(mockCampaign('ARCHIVED'));

      const result = await useCase.execute(workspaceId, campaignId, 'ARCHIVE');
      expect(result.status).toBe('ARCHIVED');
    });

    it('throws AppConflictException on unknown action', async () => {
      await expect(
        useCase.execute(
          workspaceId,
          campaignId,
          'INVALID' as unknown as import('./change-campaign-status.use-case').CampaignLifecycleAction,
        ),
      ).rejects.toThrow(AppConflictException);
    });
  });
});
