import { ResendInboundEmailAdapter } from './resend-inbound-email.adapter';
import { AppValidationException } from '../../../common/errors/application.exception';

jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation((secret) => ({
    verify: jest.fn((body, headers) => {
      if (secret === 'bad') throw new Error('Bad signature');
    })
  }))
}));

describe('ResendInboundEmailAdapter', () => {
  const adapter = new ResendInboundEmailAdapter();

  describe('verifySignature', () => {
    it('should throw AppValidationException if signature is invalid', () => {
      expect(() => {
        adapter.verifySignature({
          rawBody: Buffer.from('payload'),
          headers: {},
          secret: 'bad'
        });
      }).toThrow(new AppValidationException('Invalid webhook signature: Bad signature'));
    });

    it('should pass if signature is valid', () => {
      expect(() => {
        adapter.verifySignature({
          rawBody: Buffer.from('payload'),
          headers: {},
          secret: 'good'
        });
      }).not.toThrow();
    });
  });

  describe('parsePayload', () => {
    it('should parse typical resend inbound payload', () => {
      const payload = {
        type: 'email.received',
        created_at: '2024-02-22T21:40:53.308Z',
        data: {
          email_id: 'resend-email-123',
          from: 'Sender <sender@example.com>',
          to: ['recipient@example.com'],
          subject: 'Test reply',
          message_id: 'msg1'
        }
      };

      const result = adapter.parsePayload(Buffer.from(JSON.stringify(payload)), { 'svix-id': 'svix-123' });
      expect(result.providerEventId).toBe('svix-123');
      expect(result.providerEmailId).toBe('resend-email-123');
      expect(result.messageId).toBe('msg1');
      expect(result.inReplyTo).toBeNull();
      expect(result.references).toEqual([]);
      expect(result.fromEmail).toBe('sender@example.com');
      expect(result.toEmail).toBe('recipient@example.com');
      expect(result.subject).toBe('Test reply');
      expect(result.bodyText).toBeNull();
    });

    it('should throw AppValidationException on malformed json', () => {
      expect(() => adapter.parsePayload(Buffer.from('not json'), {})).toThrow(AppValidationException);
    });
  });
});
