import {
  fetchOutreachById,
  updateOutreach,
  approveOutreach,
  generateOutreach,
  sendOutreach,
  resumeOutreach,
  fetchCampaignRecipients,
  createOutreach,
} from './outreach';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('Outreach API Client - Canonical Modern Contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchOutreachById calls GET /api/v1/outreaches/:id', async () => {
    const mockData = { id: 'out-1', status: 'DRAFT' };
    (apiClient.get as jest.Mock).mockResolvedValue(mockData);

    const result = await fetchOutreachById('out-1');
    expect(apiClient.get).toHaveBeenCalledWith('/outreaches/out-1');
    expect(result).toEqual(mockData);
  });

  it('createOutreach calls POST /api/v1/outreaches with Idempotency-Key', async () => {
    const mockData = { id: 'out-1', status: 'DRAFT' };
    (apiClient.post as jest.Mock).mockResolvedValue(mockData);

    const payload = { personCompanyAssociationId: 'pca-1', subject: 'Sub', message: 'Body' };
    const result = await createOutreach(payload, 'key-123');

    expect(apiClient.post).toHaveBeenCalledWith('/outreaches', payload, {
      headers: { 'Idempotency-Key': 'key-123' },
    });
    expect(result).toEqual(mockData);
  });

  it('updateOutreach calls PATCH /api/v1/outreaches/:id', async () => {
    const mockRes = { id: 'out-1', status: 'DRAFT', subject: 'Updated' };
    (apiClient.patch as jest.Mock).mockResolvedValue(mockRes);

    const result = await updateOutreach('out-1', {
      subject: 'Updated',
      message: 'Updated body text',
      expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
    });

    expect(apiClient.patch).toHaveBeenCalledWith('/outreaches/out-1', {
      subject: 'Updated',
      message: 'Updated body text',
      expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result).toEqual(mockRes);
  });

  it('approveOutreach calls POST /api/v1/outreaches/:id/approve', async () => {
    const mockRes = { id: 'out-1', status: 'APPROVED' };
    (apiClient.post as jest.Mock).mockResolvedValue(mockRes);

    const result = await approveOutreach('out-1', {
      expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/outreaches/out-1/approve', {
      expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
    });
    expect(result).toEqual(mockRes);
  });

  it('generateOutreach calls POST /api/v1/outreaches/:id/generate', async () => {
    const mockRes = { jobId: 'job-1', message: 'Accepted' };
    (apiClient.post as jest.Mock).mockResolvedValue(mockRes);

    const result = await generateOutreach('out-1');
    expect(apiClient.post).toHaveBeenCalledWith('/outreaches/out-1/generate');
    expect(result).toEqual(mockRes);
  });

  it('sendOutreach calls POST /api/v1/outreaches/:id/send with Idempotency-Key header', async () => {
    const mockRes = { message: 'Dispatched' };
    (apiClient.post as jest.Mock).mockResolvedValue(mockRes);

    const result = await sendOutreach('out-1', 'test-uuid-key-1234');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/outreaches/out-1/send',
      {},
      {
        headers: {
          'Idempotency-Key': 'test-uuid-key-1234',
        },
      },
    );
    expect(result).toEqual(mockRes);
  });

  it('resumeOutreach calls POST /api/v1/outreaches/:id/resume', async () => {
    const mockRes = { id: 'out-1', status: 'ACTIVE' };
    (apiClient.post as jest.Mock).mockResolvedValue(mockRes);

    const result = await resumeOutreach('out-1');
    expect(apiClient.post).toHaveBeenCalledWith('/outreaches/out-1/resume');
    expect(result).toEqual(mockRes);
  });

  it('fetchCampaignRecipients calls GET /api/v1/campaigns/:id/recipients', async () => {
    const mockList = [{ id: 'cr-1' }, { id: 'cr-2' }];
    (apiClient.get as jest.Mock).mockResolvedValue(mockList);

    const result = await fetchCampaignRecipients('camp-1');
    expect(apiClient.get).toHaveBeenCalledWith('/campaigns/camp-1/recipients');
    expect(result).toEqual(mockList);
  });
});
