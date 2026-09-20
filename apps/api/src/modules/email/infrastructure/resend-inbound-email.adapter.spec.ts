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
        data: {
          id: 'resend-id',
          from: 'sender@example.com',
          to: ['recipient@example.com'],
          subject: 'Test reply',
          text: 'Hello world',
          headers: [
            { name: 'Message-ID', value: 'msg1' },
            { name: 'In-Reply-To', value: 'msg0' },
            { name: 'References', value: 'msg0 msg-1' }
          ]
        }
      };

      const result = adapter.parsePayload(Buffer.from(JSON.stringify(payload)));
      expect(result.providerMessageId).toBe('resend-id');
      expect(result.messageId).toBe('msg1');
      expect(result.inReplyTo).toBe('msg0');
      expect(result.references).toEqual(['msg0', 'msg-1']);
      expect(result.fromEmail).toBe('sender@example.com');
      expect(result.toEmail).toBe('recipient@example.com');
      expect(result.subject).toBe('Test reply');
      expect(result.bodyText).toBe('Hello world');
    });

    it('should throw AppValidationException on malformed json', () => {
      expect(() => adapter.parsePayload(Buffer.from('not json'))).toThrow(AppValidationException);
    });
  });
});
