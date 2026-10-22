/* eslint-disable @typescript-eslint/unbound-method */
import {
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import {
  CampaignDuplicateNameError,
  ICampaignRepository,
} from '../domain/campaign.repository.interface';
import { CampaignDuplicateNameException } from '../domain/campaign-duplicate-name.exception';
import { ICompanyRepository } from '../../company/domain/company.repository.interface';
import { CreateCampaignUseCase } from './create-campaign.use-case';
import { GetCampaignUseCase } from './get-campaign.use-case';
import { ListCampaignsUseCase } from './list-campaigns.use-case';
import { Campaign, Company } from '@repo/db';

const workspaceId = 'ws-001';
const otherWorkspaceId = 'ws-other';
const companyId = 'co-001';
const campaignId = 'camp-001';

const mockCompany = (overrides: Partial<Company> = {}): Company => ({
  id: companyId,
  workspaceId,
  name: 'Acme Corp',
  normalizedName: 'acme',
  websiteUrl: null,
  domain: null,
  description: null,
  industry: null,
  location: null,
  linkedinUrl: null,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  normalizedName: 'test-camp',
  ...overrides,
});

const mockCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: campaignId,
  workspaceId,
  companyId,
  name: 'Test Campaign',
  normalizedName: 'test campaign',
  status: 'DRAFT' as const,
  senderAccountId: null,
  followUpDelayBusinessDays: 4,
  createdAt: new Date(),
  updatedAt: new Date(),
  normalizedName: 'test-camp',
  ...overrides,
});

// ─── CreateCampaignUseCase ────────────────────────────────────────────────────

describe('CreateCampaignUseCase', () => {
  let useCase: CreateCampaignUseCase;
  let campaignRepo: jest.Mocked<ICampaignRepository>;
  let companyRepo: jest.Mocked<ICompanyRepository>;

  beforeEach(() => {
    campaignRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByNormalizedName: jest.fn().mockResolvedValue(null),
      findManyByWorkspace: jest.fn(),
      findByNormalizedName: jest.fn(),
      updateStatus: jest.fn(),
      findExistingContactBindings: jest.fn(),
      createContactBindings: jest.fn(),
    };
    companyRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByNormalizedName: jest.fn(),
      findManyByWorkspace: jest.fn(),
      findByNormalizedName: jest.fn(),
      update: jest.fn(),
    };
    useCase = new CreateCampaignUseCase(campaignRepo, companyRepo);
  });

  it('creates a campaign in DRAFT status when company belongs to workspace', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.create.mockResolvedValue(mockCampaign());

    const result = await useCase.execute(workspaceId, {
      name: 'Test Campaign',
      companyId,
    });

    expect(companyRepo.findById).toHaveBeenCalledWith(workspaceId, companyId);
    expect(campaignRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        companyId,
        name: 'Test Campaign',
      }),
    );
    expect(result.status).toBe('DRAFT');
  });

  it('trims name whitespace before persistence', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.create.mockResolvedValue(
      mockCampaign({ name: 'Trimmed Name' }),
    );

    await useCase.execute(workspaceId, {
      name: '  Trimmed Name  ',
      companyId,
    });

    expect(campaignRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Trimmed Name' }),
    );
  });

  it('persists senderAccountId as opaque string without validation', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.create.mockResolvedValue(
      mockCampaign({ senderAccountId: 'identity-ref-abc' }),
    );

    await useCase.execute(workspaceId, {
      name: 'Campaign',
      companyId,
      senderAccountId: 'identity-ref-abc',
    });

    expect(campaignRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ senderAccountId: 'identity-ref-abc' }),
    );
  });

  it('stores null when senderAccountId is omitted', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.create.mockResolvedValue(mockCampaign());

    await useCase.execute(workspaceId, { name: 'Campaign', companyId });

    expect(campaignRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ senderAccountId: null }),
    );
  });

  it('throws AppNotFoundException when companyId does not exist in workspace', async () => {
    companyRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(workspaceId, { name: 'Campaign', companyId }),
    ).rejects.toThrow(AppNotFoundException);

    expect(campaignRepo.create).not.toHaveBeenCalled();
  });

  it('throws AppNotFoundException when companyId belongs to another workspace', async () => {
    // findById scoped to workspaceId returns null — company exists but in a different workspace
    companyRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(otherWorkspaceId, { name: 'Campaign', companyId }),
    ).rejects.toThrow(AppNotFoundException);

    expect(campaignRepo.create).not.toHaveBeenCalled();
  });

  it('uses server-authoritative workspaceId regardless of request content', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.create.mockResolvedValue(mockCampaign());

    await useCase.execute(workspaceId, { name: 'Campaign', companyId });

    // workspaceId is always the one provided by the server context, never derived from dto
    expect(campaignRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
    );
  });

  it('rejects campaign name consisting solely of whitespace with AppValidationException', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());

    await expect(
      useCase.execute(workspaceId, { name: '   \t\r\n  ', companyId }),
    ).rejects.toThrow(AppValidationException);

    expect(campaignRepo.create).not.toHaveBeenCalled();
  });

  it('computes canonical normalizedName via @repo/shared and passes it to repository create', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.create.mockResolvedValue(mockCampaign());

    await useCase.execute(workspaceId, {
      name: '  Alpha — Beta   Campaign  ',
      companyId,
    });

    expect(campaignRepo.findByNormalizedName).toHaveBeenCalledWith(
      workspaceId,
      companyId,
      'alpha — beta campaign',
    );
    expect(campaignRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        companyId,
        name: 'Alpha — Beta   Campaign',
        normalizedName: 'alpha — beta campaign',
      }),
    );
  });

  it('throws CampaignDuplicateNameException with existingCampaignId when preflight lookup finds duplicate', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.findByNormalizedName.mockResolvedValue(
      mockCampaign({ id: 'existing-camp-123' }),
    );

    await expect(
      useCase.execute(workspaceId, { name: 'Test Campaign', companyId }),
    ).rejects.toThrow(CampaignDuplicateNameException);

    try {
      await useCase.execute(workspaceId, { name: 'Test Campaign', companyId });
    } catch (err) {
      expect(err).toBeInstanceOf(CampaignDuplicateNameException);
      expect((err as CampaignDuplicateNameException).existingCampaignId).toBe(
        'existing-camp-123',
      );
    }
    expect(campaignRepo.create).not.toHaveBeenCalled();
  });

  it('handles race collision by catching CampaignDuplicateNameError and throwing CampaignDuplicateNameException on race recovery read', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    // Preflight returns null (simulating concurrent gap)
    campaignRepo.findByNormalizedName.mockResolvedValueOnce(null);
    // Repository create throws duplicate name error from DB unique constraint
    campaignRepo.create.mockRejectedValueOnce(
      new CampaignDuplicateNameError(workspaceId, companyId, 'test campaign'),
    );
    // Race recovery read returns the row inserted by the concurrent request
    campaignRepo.findByNormalizedName.mockResolvedValueOnce(
      mockCampaign({ id: 'race-camp-456' }),
    );

    try {
      await useCase.execute(workspaceId, { name: 'Test Campaign', companyId });
      fail('Expected CampaignDuplicateNameException to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CampaignDuplicateNameException);
      expect((err as CampaignDuplicateNameException).existingCampaignId).toBe(
        'race-camp-456',
      );
    }
  });

  it('re-throws original error if CampaignDuplicateNameError occurs but race recovery finds no matching row', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.findByNormalizedName.mockResolvedValue(null);
    const dbErr = new CampaignDuplicateNameError(
      workspaceId,
      companyId,
      'test campaign',
    );
    campaignRepo.create.mockRejectedValueOnce(dbErr);

    await expect(
      useCase.execute(workspaceId, { name: 'Test Campaign', companyId }),
    ).rejects.toThrow(dbErr);
  });

  it('re-throws unrelated errors from repository create without converting to 409', async () => {
    companyRepo.findById.mockResolvedValue(mockCompany());
    campaignRepo.findByNormalizedName.mockResolvedValue(null);
    const genericErr = new Error('Database connection timeout');
    campaignRepo.create.mockRejectedValueOnce(genericErr);

    await expect(
      useCase.execute(workspaceId, { name: 'Test Campaign', companyId }),
    ).rejects.toThrow(genericErr);
  });
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
    // findById is scoped to workspaceId — cross-tenant returns null, not the record
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
