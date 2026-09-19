/* eslint-disable @typescript-eslint/unbound-method */
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { ICampaignRepository } from '../domain/campaign.repository.interface';
import { IContactRepository } from '../../contact/domain/contact.repository.interface';
import { AddCampaignContactsUseCase } from './add-campaign-contacts.use-case';
import { Campaign, CampaignContact, Contact } from '@repo/db';

const workspaceId = 'ws-001';
const otherWorkspaceId = 'ws-other';
const companyId = 'co-001';
const otherCompanyId = 'co-other';
const campaignId = 'camp-001';

const mockCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: campaignId,
  workspaceId,
  companyId,
  name: 'Test Campaign',
  status: 'DRAFT' as const,
  sendingIdentity: null,
  followUpDelayBusinessDays: 4,
  createdAt: new Date(),
  updatedAt: new Date(),
  normalizedName: 'test-camp',
  ...overrides,
});

const mockContact = (
  id: string,
  overrides: Partial<Contact> = {},
): Contact => ({
  id,
  workspaceId,
  companyId,
  contactKind: 'PERSON' as const,
  name: `Contact ${id}`,
  email: `${id}@example.com`,
  title: null,
  source: null,
  sourceUrl: null,
  confidence: null,
  discoveredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  normalizedName: 'test-camp',
  ...overrides,
});

const mockBinding = (contactId: string): CampaignContact => ({
  id: `cc-${contactId}`,
  workspaceId,
  campaignId,
  contactId,
  status: 'PENDING' as const,
  targetRole: null,
  outreachReason: null,
  currentSubject: null,
  currentBody: null,
  selectedOpportunityId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  normalizedName: 'test-camp',
});

describe('AddCampaignContactsUseCase', () => {
  let useCase: AddCampaignContactsUseCase;
  let campaignRepo: jest.Mocked<ICampaignRepository>;
  let contactRepo: jest.Mocked<IContactRepository>;

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
    contactRepo = {
      findCompanyContacts: jest.fn(),
      findContactById: jest.fn(),
      upsertCompanyContacts: jest.fn(),
      getCompanyContactSelection: jest.fn(),
      setCompanyContactSelection: jest.fn(),
    };
    useCase = new AddCampaignContactsUseCase(campaignRepo, contactRepo);
  });

  // ─── Campaign validation ────────────────────────────────────────────────────

  it('throws AppNotFoundException when campaign is not found in workspace', async () => {
    campaignRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(workspaceId, campaignId, { contactIds: ['c-1'] }),
    ).rejects.toThrow(AppNotFoundException);

    expect(contactRepo.findContactById).not.toHaveBeenCalled();
    expect(campaignRepo.createContactBindings).not.toHaveBeenCalled();
  });

  it('throws AppNotFoundException for cross-tenant campaign access (non-enumerating)', async () => {
    campaignRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(otherWorkspaceId, campaignId, { contactIds: ['c-1'] }),
    ).rejects.toThrow(AppNotFoundException);
  });

  // ─── All-or-nothing: contact validation ────────────────────────────────────

  it('throws AppNotFoundException and creates zero bindings when one contact is not found', async () => {
    campaignRepo.findById.mockResolvedValue(mockCampaign());
    contactRepo.findContactById
      .mockResolvedValueOnce(mockContact('c-1'))
      .mockResolvedValueOnce(null); // c-2 is invalid

    await expect(
      useCase.execute(workspaceId, campaignId, { contactIds: ['c-1', 'c-2'] }),
    ).rejects.toThrow(AppNotFoundException);

    expect(campaignRepo.createContactBindings).not.toHaveBeenCalled();
  });

  it('throws AppNotFoundException and creates zero bindings when contact belongs to wrong company', async () => {
    campaignRepo.findById.mockResolvedValue(mockCampaign());
    contactRepo.findContactById.mockResolvedValue(
      mockContact('c-1', { companyId: otherCompanyId }),
    );

    await expect(
      useCase.execute(workspaceId, campaignId, { contactIds: ['c-1'] }),
    ).rejects.toThrow(AppNotFoundException);

    expect(campaignRepo.createContactBindings).not.toHaveBeenCalled();
  });

  it('throws AppNotFoundException and creates zero bindings when contact belongs to wrong workspace', async () => {
    // findContactById scoped to workspaceId returns null for cross-tenant contacts
    campaignRepo.findById.mockResolvedValue(mockCampaign());
    contactRepo.findContactById.mockResolvedValue(null);

    await expect(
      useCase.execute(workspaceId, campaignId, { contactIds: ['c-1'] }),
    ).rejects.toThrow(AppNotFoundException);

    expect(campaignRepo.createContactBindings).not.toHaveBeenCalled();
  });

  // ─── Idempotent duplicate handling ─────────────────────────────────────────

  it('does not create a new binding when the contact is already bound', async () => {
    campaignRepo.findById.mockResolvedValue(mockCampaign());
    contactRepo.findContactById.mockResolvedValue(mockContact('c-1'));
    campaignRepo.findExistingContactBindings.mockResolvedValue(
      new Set(['c-1']),
    );

    const result = await useCase.execute(workspaceId, campaignId, {
      contactIds: ['c-1'],
    });

    expect(campaignRepo.createContactBindings).not.toHaveBeenCalled();
    expect(result.bound).toHaveLength(0);
    expect(result.ignoredDuplicateCount).toBe(1);
  });

  it('deduplicates repeated contactIds within the same payload', async () => {
    campaignRepo.findById.mockResolvedValue(mockCampaign());
    contactRepo.findContactById.mockResolvedValue(mockContact('c-1'));
    campaignRepo.findExistingContactBindings.mockResolvedValue(new Set());
    campaignRepo.createContactBindings.mockResolvedValue([mockBinding('c-1')]);

    await useCase.execute(workspaceId, campaignId, {
      contactIds: ['c-1', 'c-1', 'c-1'],
    });

    // contactRepo should only be called once for the deduplicated id
    expect(contactRepo.findContactById).toHaveBeenCalledTimes(1);
    expect(campaignRepo.createContactBindings).toHaveBeenCalledWith(
      workspaceId,
      campaignId,
      ['c-1'],
    );
  });

  it('only persists new contacts when some are already bound', async () => {
    campaignRepo.findById.mockResolvedValue(mockCampaign());
    contactRepo.findContactById
      .mockResolvedValueOnce(mockContact('c-1'))
      .mockResolvedValueOnce(mockContact('c-2'));
    campaignRepo.findExistingContactBindings.mockResolvedValue(
      new Set(['c-1']),
    );
    campaignRepo.createContactBindings.mockResolvedValue([mockBinding('c-2')]);

    const result = await useCase.execute(workspaceId, campaignId, {
      contactIds: ['c-1', 'c-2'],
    });

    expect(campaignRepo.createContactBindings).toHaveBeenCalledWith(
      workspaceId,
      campaignId,
      ['c-2'],
    );
    expect(result.bound).toHaveLength(1);
    expect(result.ignoredDuplicateCount).toBe(1);
  });

  // ─── Success paths ──────────────────────────────────────────────────────────

  it('creates bindings with status PENDING for new contacts', async () => {
    campaignRepo.findById.mockResolvedValue(mockCampaign());
    contactRepo.findContactById.mockResolvedValue(mockContact('c-1'));
    campaignRepo.findExistingContactBindings.mockResolvedValue(new Set());
    const binding = mockBinding('c-1');
    campaignRepo.createContactBindings.mockResolvedValue([binding]);

    const result = await useCase.execute(workspaceId, campaignId, {
      contactIds: ['c-1'],
    });

    expect(result.bound[0].status).toBe('PENDING');
    expect(result.bound[0].contactId).toBe('c-1');
    expect(result.ignoredDuplicateCount).toBe(0);
  });

  it('uses server-authoritative workspaceId for all persistence calls', async () => {
    campaignRepo.findById.mockResolvedValue(mockCampaign());
    contactRepo.findContactById.mockResolvedValue(mockContact('c-1'));
    campaignRepo.findExistingContactBindings.mockResolvedValue(new Set());
    campaignRepo.createContactBindings.mockResolvedValue([mockBinding('c-1')]);

    await useCase.execute(workspaceId, campaignId, { contactIds: ['c-1'] });

    expect(campaignRepo.findById).toHaveBeenCalledWith(workspaceId, campaignId);
    expect(contactRepo.findContactById).toHaveBeenCalledWith(
      workspaceId,
      'c-1',
    );
    expect(campaignRepo.findExistingContactBindings).toHaveBeenCalledWith(
      workspaceId,
      campaignId,
      ['c-1'],
    );
    expect(campaignRepo.createContactBindings).toHaveBeenCalledWith(
      workspaceId,
      campaignId,
      ['c-1'],
    );
  });
});
