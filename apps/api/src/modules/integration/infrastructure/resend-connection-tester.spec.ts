import { ResendConnectionTester } from './resend-connection-tester';
import type { ResendCredentials } from '../../email/domain/provider-credentials';

const RESEND_CREDS: ResendCredentials = { provider: 'RESEND', apiKey: 'test-key' };

describe('ResendConnectionTester', () => {
  let tester: ResendConnectionTester;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    tester = new ResendConnectionTester();
    mockFetch = jest.fn();
    global.fetch = mockFetch as any;
  });

  const httpResponse = (status: number) => Promise.resolve({ status });

  // ── success classifications ─────────────────────────────────────────────

  it('HTTP 200 → success: true', async () => {
    mockFetch.mockReturnValue(httpResponse(200));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: true });
  });

  it('HTTP 400 (invalid payload probe = auth succeeded) → success: true', async () => {
    mockFetch.mockReturnValue(httpResponse(400));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: true });
  });

  it('HTTP 422 → success: true', async () => {
    mockFetch.mockReturnValue(httpResponse(422));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: true });
  });

  // ── credential failure classifications ─────────────────────────────────

  it('HTTP 401 → success: false, reason: INVALID_CREDENTIALS', async () => {
    mockFetch.mockReturnValue(httpResponse(401));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'INVALID_CREDENTIALS' });
  });

  it('HTTP 403 → success: false, reason: INVALID_CREDENTIALS', async () => {
    mockFetch.mockReturnValue(httpResponse(403));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'INVALID_CREDENTIALS' });
  });

  // ── provider unavailable classifications ───────────────────────────────

  it('HTTP 429 → success: false, reason: PROVIDER_UNAVAILABLE', async () => {
    mockFetch.mockReturnValue(httpResponse(429));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'PROVIDER_UNAVAILABLE' });
  });

  it('HTTP 500 → success: false, reason: PROVIDER_UNAVAILABLE', async () => {
    mockFetch.mockReturnValue(httpResponse(500));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'PROVIDER_UNAVAILABLE' });
  });

  it('HTTP 502 → success: false, reason: PROVIDER_UNAVAILABLE', async () => {
    mockFetch.mockReturnValue(httpResponse(502));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'PROVIDER_UNAVAILABLE' });
  });

  it('HTTP 503 → success: false, reason: PROVIDER_UNAVAILABLE', async () => {
    mockFetch.mockReturnValue(httpResponse(503));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'PROVIDER_UNAVAILABLE' });
  });

  it('HTTP 504 → success: false, reason: PROVIDER_UNAVAILABLE', async () => {
    mockFetch.mockReturnValue(httpResponse(504));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'PROVIDER_UNAVAILABLE' });
  });

  // ── network failure classifications ────────────────────────────────────

  it('network throw (ECONNREFUSED) → success: false, reason: CONNECTION_FAILED', async () => {
    const netErr = new Error('fetch failed');
    mockFetch.mockRejectedValue(netErr);
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'CONNECTION_FAILED' });
  });

  it('generic Error throw → success: false, reason: CONNECTION_FAILED', async () => {
    mockFetch.mockRejectedValue(new Error('Something went wrong'));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(result).toEqual({ success: false, reason: 'CONNECTION_FAILED' });
  });

  // ── wrong provider ─────────────────────────────────────────────────────

  it('non-RESEND provider credentials → success: false, reason: INVALID_CREDENTIALS', async () => {
    const result = await tester.testConnection({ provider: 'SES' } as any);
    expect(result).toEqual({ success: false, reason: 'INVALID_CREDENTIALS' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── safety: no raw infrastructure error text leaked ──────────────────

  const SAFE_REASONS = new Set(['INVALID_CREDENTIALS', 'PROVIDER_UNAVAILABLE', 'CONNECTION_FAILED', undefined]);

  it.each([200, 400, 401, 403, 422, 429, 500, 503])(
    'HTTP %i: reason is never a raw error string',
    async (status) => {
      mockFetch.mockReturnValue(httpResponse(status));
      const result = await tester.testConnection(RESEND_CREDS);
      expect(SAFE_REASONS.has(result.reason)).toBe(true);
    },
  );

  it('network error: reason is never the raw error message', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:443 - raw infrastructure detail'));
    const result = await tester.testConnection(RESEND_CREDS);
    expect(SAFE_REASONS.has(result.reason)).toBe(true);
    expect(result.reason).not.toMatch(/ECONNREFUSED/);
  });
});
