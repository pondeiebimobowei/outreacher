import {
  ResendEmailProviderAdapter,
  EmailProviderException,
} from './resend-email-provider.adapter';
import { EmailDispatchErrorCode } from '../domain/email-provider.adapter';

describe('ResendEmailProviderAdapter Classification', () => {
  let adapter: ResendEmailProviderAdapter;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    adapter = new ResendEmailProviderAdapter('http://localhost');
    mockFetch = jest.fn();
    global.fetch = mockFetch as any;
  });

  const baseInput = {
    workspaceId: 'ws-1',
    senderAccountId: 'sa-1',
    campaignMemberId: 'cc-1',
    emailSendId: 'es-1',
    toEmail: 'test@target.com',
    fromName: 'Sender',
    fromEmail: 'sender@outreacher.local',
    subject: 'Subject',
    bodyText: 'Body',
    replyToToken: 'token-123',
    idempotencyKey: 'idem-1',
    credentials: { apiKey: 'test' },
  };

  it('classifies pre-submit connection failures (ECONNREFUSED) as PROVIDER_CONNECT_FAILURE', async () => {
    const sysError = new Error('fetch failed');
    (sysError as any).cause = { code: 'ECONNREFUSED' };
    mockFetch.mockRejectedValue(sysError);

    await expect(adapter.sendEmail(baseInput)).rejects.toMatchObject({
      dispatchErrorCode: EmailDispatchErrorCode.PROVIDER_CONNECT_FAILURE,
    });
  });

  it('classifies permanent provider rejection (HTTP 400) as PROVIDER_REJECTED', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: 'Bad request' }),
    });

    await expect(adapter.sendEmail(baseInput)).rejects.toMatchObject({
      dispatchErrorCode: EmailDispatchErrorCode.PROVIDER_REJECTED,
    });
  });

  it('classifies post-submit timeout (AbortError) as PROVIDER_TIMEOUT_UNCERTAIN', async () => {
    const sysError = new Error('The operation was aborted');
    sysError.name = 'AbortError';
    mockFetch.mockRejectedValue(sysError);

    await expect(adapter.sendEmail(baseInput)).rejects.toMatchObject({
      dispatchErrorCode: EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN,
    });
  });

  it('classifies post-submit socket break (ECONNRESET) as PROVIDER_TIMEOUT_UNCERTAIN', async () => {
    const sysError = new Error('fetch failed');
    (sysError as any).cause = { code: 'ECONNRESET' };
    mockFetch.mockRejectedValue(sysError);

    await expect(adapter.sendEmail(baseInput)).rejects.toMatchObject({
      dispatchErrorCode: EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN,
    });
  });
});
