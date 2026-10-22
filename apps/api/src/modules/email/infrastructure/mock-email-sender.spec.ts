import { EmailProviderException } from '../domain/email-sender.interface';
import { MockEmailSender } from './mock-email-sender';

describe('MockEmailSender', () => {
  let sender: MockEmailSender;

  const validEmailInput = {
    workspaceId: 'ws-1',
    campaignMemberId: 'cc-1',
    toEmail: 'lead@company.com',
    fromEmail: 'founder@startup.com',
    subject: 'Introductory chat',
    bodyText: 'Hi, would love to connect.',
    idempotencyKey: 'send:cc-1:1',
  };

  beforeEach(() => {
    sender = new MockEmailSender();
  });

  it('records sent emails and returns distinct providerMessageId and rfcMessageId', async () => {
    const result = await sender.sendEmail(validEmailInput);

    expect(sender.sentEmails).toHaveLength(1);
    expect(sender.sentEmails[0]).toEqual(validEmailInput);
    expect(result.providerMessageId).toMatch(/^mock_re_/);
    expect(result.rfcMessageId).toMatch(/^<[0-9a-f-]+@startup\.com>$/);
    expect(result.providerMessageId).not.toBe(result.rfcMessageId);
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it('throws configured error when shouldFail is true', async () => {
    sender.shouldFail = true;

    await expect(sender.sendEmail(validEmailInput)).rejects.toThrow(
      EmailProviderException,
    );
  });

  it('clears state on reset', async () => {
    await sender.sendEmail(validEmailInput);
    sender.shouldFail = true;

    sender.reset();

    expect(sender.sentEmails).toHaveLength(0);
    expect(sender.shouldFail).toBe(false);
  });
});
