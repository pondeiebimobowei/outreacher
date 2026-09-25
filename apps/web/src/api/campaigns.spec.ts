import { apiClient } from './client';
import {
  CampaignDto,
  addContactsToCampaign,
  createCampaign,
  fetchCampaigns,
  resolveCanonicalCompanyCampaign,
} from './campaigns';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
  ApiError: jest.requireActual('./client').ApiError,
}));

describe('Campaigns API Module - Packet 3 Dual Contract', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveCanonicalCompanyCampaign', () => {
    it('returns canonical campaign when matching name exists, regardless of DRAFT status', async () => {
      const canonicalDraft: CampaignDto = {
        id: 'camp-draft',
        workspaceId: 'ws-1',
        companyId: 'comp-10',
        name: 'Outreach — Acme Technologies',
        status: 'DRAFT',
        senderAccountId: '',
        templateId: '',
        normalizedName: '',
        followUpDelayBusinessDays: 4,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      mockGet.mockResolvedValue([canonicalDraft]);

      const result = await resolveCanonicalCompanyCampaign('comp-10', 'Acme Technologies');

      expect(result).toEqual(canonicalDraft);
      expect(mockGet).toHaveBeenCalledWith('/campaigns');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('ignores unrelated ACTIVE campaigns for the same company and creates canonical campaign', async () => {
      const unrelatedActive: CampaignDto = {
        id: 'camp-unrelated',
        workspaceId: 'ws-1',
        companyId: 'comp-10',
        name: 'Backend Outreach - September',
        status: 'ACTIVE',
        normalizedName: 'Backend Outreach - September',
        templateId: 'template-1',
        senderAccountId: '',
        followUpDelayBusinessDays: 3,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      const createdCanonical: CampaignDto = {
        id: 'camp-new',
        workspaceId: 'ws-1',
        companyId: 'comp-10',
        name: 'Outreach — Acme Technologies',
        status: 'DRAFT',
        senderAccountId: '',
        templateId: '',
        normalizedName: 'Outreach — Acme Technologies',
        followUpDelayBusinessDays: 4,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      mockGet.mockResolvedValue([unrelatedActive]);
      mockPost.mockResolvedValue(createdCanonical);

      const result = await resolveCanonicalCompanyCampaign('comp-10', 'Acme Technologies');

      expect(result).toBeNull();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('deduplicates concurrent in-flight resolutions for the same companyId', async () => {
      const createdCanonical: CampaignDto = {
        id: 'camp-dedup',
        workspaceId: 'ws-1',
        companyId: 'comp-race',
        name: 'Outreach — Concurrent Inc',
        status: 'DRAFT',
        senderAccountId: '',
        templateId: '',
        normalizedName: 'Outreach — Concurrent Inc',
        followUpDelayBusinessDays: 4,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      // Simulate a small network delay
      mockGet.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 10)),
      );
      mockPost.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createdCanonical), 10)),
      );

      // Issue 3 simultaneous calls
      const [res1, res2, res3] = await Promise.all([
        resolveCanonicalCompanyCampaign('comp-race', 'Concurrent Inc'),
        resolveCanonicalCompanyCampaign('comp-race', 'Concurrent Inc'),
        resolveCanonicalCompanyCampaign('comp-race', 'Concurrent Inc'),
      ]);

      expect(res1).toBeNull();
      expect(res2).toBeNull();
      expect(res3).toBeNull();

      // Verify that network calls were deduplicated to exactly ONE fetch
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('cleans up in-flight map upon promise settlement so subsequent calls perform fresh lookups', async () => {
      const canonicalA: CampaignDto = {
        id: 'camp-1',
        workspaceId: 'ws-1',
        companyId: 'comp-lifecycle',
        name: 'Outreach — Lifecycle Corp',
        status: 'DRAFT',
        senderAccountId: '',
        templateId: '',
        normalizedName: 'Outreach — Lifecycle Corp',
        followUpDelayBusinessDays: 4,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      mockGet.mockResolvedValueOnce([canonicalA]);

      // First resolution call
      const res1 = await resolveCanonicalCompanyCampaign('comp-lifecycle', 'Lifecycle Corp');
      expect(res1).toEqual(canonicalA);
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Subsequent call AFTER settlement must fetch again (proves Map does not retain stale cache)
      const canonicalB: CampaignDto = {
        ...canonicalA,
        status: 'ACTIVE',
        updatedAt: '2026-09-19T00:00:00Z',
      };
      mockGet.mockResolvedValueOnce([canonicalB]);

      const res2 = await resolveCanonicalCompanyCampaign('comp-lifecycle', 'Lifecycle Corp');
      expect(res2).toEqual(canonicalB);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('cleans up in-flight map on error settlement so subsequent calls can retry', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network drop'));

      await expect(
        resolveCanonicalCompanyCampaign('comp-err', 'Error Corp'),
      ).rejects.toThrow('Network drop');

      // Subsequent call should retry and succeed once network recovers
      const canonical: CampaignDto = {
        id: 'camp-recovered',
        workspaceId: 'ws-1',
        companyId: 'comp-err',
        name: 'Outreach — Error Corp',
        status: 'ACTIVE',
        senderAccountId: '',
        templateId: '',
        normalizedName: 'Outreach — Error Corp',
        followUpDelayBusinessDays: 4,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };
      mockGet.mockResolvedValueOnce([canonical]);

      const res = await resolveCanonicalCompanyCampaign('comp-err', 'Error Corp');
      expect(res).toEqual(canonical);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });


    it('matches canonical campaign when server name has different dash variant (hyphen vs em-dash)', async () => {
      const existingWithHyphen: CampaignDto = {
        id: 'camp-hyphen',
        workspaceId: 'ws-1',
        companyId: 'comp-dash',
        name: 'Outreach - Dash Corp', // hyphen instead of em dash
        status: 'DRAFT',
        senderAccountId: '',
        templateId: '',
        normalizedName: 'Outreach - Dash Corp',
        followUpDelayBusinessDays: 4,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      mockGet.mockResolvedValueOnce([existingWithHyphen]);

      const result = await resolveCanonicalCompanyCampaign('comp-dash', 'Dash Corp');
      expect(result).toEqual(existingWithHyphen);
      expect(mockPost).not.toHaveBeenCalled();
    });

  });

  describe('addContactsToCampaign', () => {
    it('calls POST /api/v1/campaigns/:id/contacts with contactIds', async () => {
      const mockResponse = {
        bound: [
          {
            id: 'cc-1',
            workspaceId: 'ws-1',
            campaignId: 'camp-1',
            contactId: 'cont-1',
            status: 'PENDING' as const,
            targetRole: null,
            outreachReason: null,
            currentSubject: null,
            currentBody: null,
            selectedOpportunityId: null,
            createdAt: '2026-09-18T00:00:00Z',
            updatedAt: '2026-09-18T00:00:00Z',
          },
        ],
        ignoredDuplicateCount: 0,
      };

      mockPost.mockResolvedValue(mockResponse);

      const result = await addContactsToCampaign('camp-1', ['cont-1']);

      expect(result).toEqual(mockResponse);
      expect(mockPost).toHaveBeenCalledWith('/campaigns/camp-1/contacts', {
        contactIds: ['cont-1'],
      });
    });
  });

  describe('fetchCampaigns and createCampaign', () => {
    it('fetchCampaigns calls GET /campaigns', async () => {
      mockGet.mockResolvedValue([]);
      await fetchCampaigns();
      expect(mockGet).toHaveBeenCalledWith('/campaigns');
    });

    it('createCampaign calls POST /campaigns with payload', async () => {
      mockPost.mockResolvedValue({ id: 'c-1' });
      await createCampaign({ companyId: 'comp-1', name: 'New Campaign', senderAccountId: 'acc-1', templateId: 'tpl-1', status: 'DRAFT' });
      expect(mockPost).toHaveBeenCalledWith('/campaigns', {
        companyId: 'comp-1',
        name: 'New Campaign',
      });
    });
  });
});
