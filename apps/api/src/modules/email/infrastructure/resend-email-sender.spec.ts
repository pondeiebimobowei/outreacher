import {
  EmailProviderException,
  EmailRateLimitException,
  EmailTimeoutException,
} from '../domain/email-sender.interface';
import { ResendEmailSender } from './resend-email-sender';

describe('ResendEmailSender', () => {
  let sender: ResendEmailSender;
  const originalFetch = global.fetch;

  const validEmailInput = {
    workspaceId: 'ws-1',
    campaignContactId: 'cc-1',
    toEmail: 'target@enterprise.com',
    fromEmail: 'sales@proactive.com',
    subject: 'Strategic outreach',
    bodyText: 'Let us connect this week.',
    idempotencyKey: 'send:cc-1:1',
  };

  beforeEach(() => {
    sender = new ResendEmailSender(
      're_test_key_123',
      'https://mock.resend.test',
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws EmailProviderException if API key is missing', async () => {
    const unconfiguredSender = new ResendEmailSender(
      '',
      'https://mock.resend.test',
    );

    await expect(unconfiguredSender.sendEmail(validEmailInput)).rejects.toThrow(
      new EmailProviderException('Resend API key is not configured'),
    );
  });

  it('sends email with Idempotency-Key header and custom Message-ID header, separating message IDs', async () => {
    const mockResponseId = 'resend_msg_uuid_999';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ id: mockResponseId }),
    });

    const result = await sender.sendEmail(validEmailInput);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://mock.resend.test/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key_123',
          'Idempotency-Key': 'send:cc-1:1',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body as string);

    expect(requestBody.from).toBe('sales@proactive.com');
    expect(requestBody.to).toEqual(['target@enterprise.com']);
    expect(requestBody.subject).toBe('Strategic outreach');
    expect(requestBody.text).toBe('Let us connect this week.');
    expect(requestBody.headers['Message-ID']).toMatch(
      /^<[0-9a-f-]+@proactive\.com>$/,
    );

    expect(result.providerMessageId).toBe('resend_msg_uuid_999');
    expect(result.rfcMessageId).toBe(requestBody.headers['Message-ID']);
    expect(result.providerMessageId).not.toBe(result.rfcMessageId);
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it('maps 429 status to EmailRateLimitException', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('Too many requests'),
    });

    await expect(sender.sendEmail(validEmailInput)).rejects.toThrow(
      EmailRateLimitException,
    );
  });

  it('maps 409 conflict error to EmailProviderException with message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          name: 'conflict_error',
          message: 'Idempotency key has already been used',
        }),
      ),
    });

    await expect(sender.sendEmail(validEmailInput)).rejects.toThrow(
      new EmailProviderException('Idempotency key has already been used'),
    );
  });

  it('maps abort signal error to EmailTimeoutException', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    await expect(sender.sendEmail(validEmailInput)).rejects.toThrow(
      EmailTimeoutException,
    );
  });
});
