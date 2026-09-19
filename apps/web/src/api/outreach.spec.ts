import {
  fetchCampaignContact,
  fetchCampaignContacts,
  triggerGenerateOutreach,
  updateOutreachDraft,
  approveOutreachDraft,
  sendCampaignContact,
} from './outreach';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('Outreach API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchCampaignContact calls GET /api/v1/campaign-contacts/:id', async () => {
    const mockData = { id: 'cc-1', status: 'PENDING' };
    (apiClient.get as jest.Mock).mockResolvedValue(mockData);

    const result = await fetchCampaignContact('cc-1');
    expect(apiClient.get).toHaveBeenCalledWith('/campaign-contacts/cc-1');
    expect(result).toEqual(mockData);
  });

  it('fetchCampaignContacts calls GET /api/v1/campaigns/:id/contacts', async () => {
    const mockList = [{ id: 'cc-1' }, { id: 'cc-2' }];
    (apiClient.get as jest.Mock).mockResolvedValue(mockList);

    const result = await fetchCampaignContacts('camp-1');
    expect(apiClient.get).toHaveBeenCalledWith('/campaigns/camp-1/contacts');
    expect(result).toEqual(mockList);
  });

  it('triggerGenerateOutreach calls POST /api/v1/campaign-contacts/:id/generate-outreach', async () => {
    const mockRes = { jobId: 'job-1', status: 'QUEUED' };
    (apiClient.post as jest.Mock).mockResolvedValue(mockRes);

    const result = await triggerGenerateOutreach('cc-1');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/campaign-contacts/cc-1/generate-outreach',
    );
    expect(result).toEqual(mockRes);
  });

  it('updateOutreachDraft calls PATCH /api/v1/campaign-contacts/:id/draft with input and expectedUpdatedAt', async () => {
    const mockRes = { id: 'cc-1', status: 'PENDING', currentSubject: 'Updated' };
    (apiClient.patch as jest.Mock).mockResolvedValue(mockRes);

    const result = await updateOutreachDraft('cc-1', {
      subject: 'Updated',
      bodyText: 'Updated body with enough chars',
      expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
    });

    expect(apiClient.patch).toHaveBeenCalledWith('/campaign-contacts/cc-1/draft', {
      subject: 'Updated',
      bodyText: 'Updated body with enough chars',
      expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result).toEqual(mockRes);
  });

  it('approveOutreachDraft calls POST /api/v1/campaign-contacts/:id/approve with expectedUpdatedAt', async () => {
    const mockRes = { id: 'cc-1', status: 'READY' };
    (apiClient.post as jest.Mock).mockResolvedValue(mockRes);

    const result = await approveOutreachDraft('cc-1', {
      expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/campaign-contacts/cc-1/approve', {
      expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result).toEqual(mockRes);
  });

  it('sendCampaignContact calls POST /api/v1/campaign-contacts/:id/send with Idempotency-Key header', async () => {
    const mockRes = { jobId: 'job-send-1', message: 'Dispatch enqueued' };
    (apiClient.post as jest.Mock).mockResolvedValue(mockRes);

    const result = await sendCampaignContact('cc-1', 'test-uuid-key-1234');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/campaign-contacts/cc-1/send',
      {},
      {
        headers: {
          'Idempotency-Key': 'test-uuid-key-1234',
        },
      },
    );
    expect(result).toEqual(mockRes);
  });
});
