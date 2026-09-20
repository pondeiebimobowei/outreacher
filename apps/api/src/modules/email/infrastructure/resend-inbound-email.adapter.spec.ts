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
    const validPayload = {
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
    const validHeaders = { 'svix-id': 'svix-123' };

    it('should parse valid resend inbound payload', () => {
      const result = adapter.parsePayload(Buffer.from(JSON.stringify(validPayload)), validHeaders);
      expect(result.providerEventId).toBe('svix-123');
      expect(result.providerEmailId).toBe('resend-email-123');
      expect(result.messageId).toBe('msg1');
      expect(result.fromEmail).toBe('sender@example.com');
      expect(result.toEmail).toBe('recipient@example.com');
    });

    it('should throw AppValidationException on malformed json', () => {
      expect(() => adapter.parsePayload(Buffer.from('not json'), validHeaders)).toThrow(AppValidationException);
    });

    it('should throw if type is not email.received', () => {
      const payload = { ...validPayload, type: 'email.sent' };
      expect(() => adapter.parsePayload(Buffer.from(JSON.stringify(payload)), validHeaders))
        .toThrow(new AppValidationException('Unsupported webhook event type: email.sent'));
    });

    it('should throw if missing svix-id', () => {
      expect(() => adapter.parsePayload(Buffer.from(JSON.stringify(validPayload)), {}))
        .toThrow(new AppValidationException('Missing svix-id header'));
    });

    it('should throw if missing email_id', () => {
      const payload = { ...validPayload, data: { ...validPayload.data, email_id: undefined } };
      expect(() => adapter.parsePayload(Buffer.from(JSON.stringify(payload)), validHeaders))
        .toThrow(new AppValidationException('Missing email_id in payload'));
    });

    it('should throw if missing message_id', () => {
      const payload = { ...validPayload, data: { ...validPayload.data, message_id: undefined } };
      expect(() => adapter.parsePayload(Buffer.from(JSON.stringify(payload)), validHeaders))
        .toThrow(new AppValidationException('Missing message_id in payload'));
    });

    it('should throw if missing from', () => {
      const payload = { ...validPayload, data: { ...validPayload.data, from: undefined } };
      expect(() => adapter.parsePayload(Buffer.from(JSON.stringify(payload)), validHeaders))
        .toThrow(new AppValidationException('Missing from address in payload'));
    });

    it('should throw if missing recipient', () => {
      const payload = { ...validPayload, data: { ...validPayload.data, to: [] } };
      expect(() => adapter.parsePayload(Buffer.from(JSON.stringify(payload)), validHeaders))
        .toThrow(new AppValidationException('Missing recipient in payload'));
    });
  });
});
