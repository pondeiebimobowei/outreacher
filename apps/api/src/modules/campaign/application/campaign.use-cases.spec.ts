/* eslint-disable @typescript-eslint/unbound-method */
import {
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import {
  ICampaignRepository,
} from '../domain/campaign.repository.interface';
import { GetCampaignUseCase } from './get-campaign.use-case';
import { ListCampaignsUseCase } from './list-campaigns.use-case';
import { Campaign } from '@repo/db';

const workspaceId = 'ws-001';
const otherWorkspaceId = 'ws-other';
const campaignId = 'camp-001';

const mockCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: campaignId,
  workspaceId,
  name: 'Test Campaign',
  status: 'DRAFT' as const,
  contentSource: 'AI' as const,
  templateId: null,
  aiPromptContext: null,
  followUpDelayBusinessDays: 4,
  maxFollowUps: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  normalizedName: 'test-camp',
  ...overrides,
});

// ─── GetCampaignUseCase ───────────────────────────────────────────────────────

describe('GetCampaignUseCase', () => {
  let useCase: GetCampaignUseCase;
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
    useCase = new GetCampaignUseCase(campaignRepo);
  });

  it('returns campaign when it belongs to the workspace', async () => {
    campaignRepo.findById.mockResolvedValue(mockCampaign());

    const result = await useCase.execute(workspaceId, campaignId);

    expect(campaignRepo.findById).toHaveBeenCalledWith(workspaceId, campaignId);
    expect(result.id).toBe(campaignId);
  });

  it('throws AppNotFoundException when campaign is not found', async () => {
    campaignRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(workspaceId, campaignId)).rejects.toThrow(
      AppNotFoundException,
    );
  });

  it('throws AppNotFoundException when campaign belongs to another workspace (non-enumerating)', async () => {
    campaignRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(otherWorkspaceId, campaignId)).rejects.toThrow(
      AppNotFoundException,
    );
  });
});

// ─── ListCampaignsUseCase ─────────────────────────────────────────────────────

describe('ListCampaignsUseCase', () => {
  let useCase: ListCampaignsUseCase;
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
    useCase = new ListCampaignsUseCase(campaignRepo);
  });

  it('returns campaigns for the workspace', async () => {
    const campaigns = [mockCampaign(), mockCampaign({ id: 'camp-002' })];
    campaignRepo.findManyByWorkspace.mockResolvedValue(campaigns);

    const result = await useCase.execute(workspaceId);

    expect(campaignRepo.findManyByWorkspace).toHaveBeenCalledWith(workspaceId);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when workspace has no campaigns', async () => {
    campaignRepo.findManyByWorkspace.mockResolvedValue([]);

    const result = await useCase.execute(workspaceId);

    expect(result).toEqual([]);
  });

  it('uses server-authoritative workspaceId — not a client-supplied value', async () => {
    campaignRepo.findManyByWorkspace.mockResolvedValue([]);

    await useCase.execute(workspaceId);

    expect(campaignRepo.findManyByWorkspace).toHaveBeenCalledWith(workspaceId);
    expect(campaignRepo.findManyByWorkspace).not.toHaveBeenCalledWith(
      otherWorkspaceId,
    );
  });
});
