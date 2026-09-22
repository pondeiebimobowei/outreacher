import { ResendDeliveryEventAdapter } from './resend-delivery-event.adapter';
import { AppValidationException } from '../../../common/errors/application.exception';
import { EmailEventType } from '@repo/db';
import { Webhook } from 'svix';


jest.mock('svix', () => {
  const verifyMock = jest.fn();
  return {
    Webhook: jest.fn().mockImplementation(() => ({
      verify: verifyMock,
    })),
    __verifyMock: verifyMock,
  };
});


describe('ResendDeliveryEventAdapter', () => {
  let adapter: ResendDeliveryEventAdapter;

  beforeEach(() => {
    adapter = new ResendDeliveryEventAdapter();
    jest.clearAllMocks();
  });

  describe('verifySignature', () => {
    it('should pass for valid signature', () => {
      const { __verifyMock } = require('svix');
      __verifyMock.mockReturnValue(true);

      expect(() => {
        adapter.verifySignature({
          rawBody: Buffer.from('test'),
          headers: { 'svix-signature': 'sig' },
          secret: 'secret',
        });
      }).not.toThrow();
    });

    it('should throw AppValidationException for invalid signature', () => {
      const { __verifyMock } = require('svix');
      __verifyMock.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() => {
        adapter.verifySignature({
          rawBody: Buffer.from('test'),
          headers: { 'svix-signature': 'bad' },
          secret: 'secret',
        });
      }).toThrow(AppValidationException);
    });
  });

  describe('parsePayload', () => {
    const createPayload = (type: string, data: any) => Buffer.from(JSON.stringify({ type, data }));
    const validHeaders = { 'svix-id': 'evt_123' };

    it('should parse valid SENT', () => {
      const result = adapter.parsePayload(createPayload('email.sent', { email_id: 'msg_123', to: 'test@test.com' }), validHeaders);
      expect(result.status).toBe('VALID');
      if (result.status === 'VALID') {
        expect(result.event.eventType).toBe(EmailEventType.SENT);
      }
    });

    it('should parse valid DELIVERED', () => {
      const result = adapter.parsePayload(createPayload('email.delivered', { email_id: 'msg_123', to: 'test@test.com' }), validHeaders);
      expect(result.status).toBe('VALID');
      if (result.status === 'VALID') {
        expect(result.event.eventType).toBe(EmailEventType.DELIVERED);
      }
    });

    it('should parse valid BOUNCED', () => {
      const result = adapter.parsePayload(createPayload('email.bounced', { email_id: 'msg_123', to: 'test@test.com' }), validHeaders);
      expect(result.status).toBe('VALID');
      if (result.status === 'VALID') {
        expect(result.event.eventType).toBe(EmailEventType.BOUNCED);
      }
    });

    it('should parse valid COMPLAINED', () => {
      const result = adapter.parsePayload(createPayload('email.complained', { email_id: 'msg_123', to: 'test@test.com' }), validHeaders);
      expect(result.status).toBe('VALID');
      if (result.status === 'VALID') {
        expect(result.event.eventType).toBe(EmailEventType.COMPLAINED);
      }
    });

    it('should return UNSUPPORTED for delivery_delayed', () => {
      const result = adapter.parsePayload(createPayload('email.delivery_delayed', { email_id: 'msg_123', to: 'test@test.com' }), validHeaders);
      expect(result.status).toBe('UNSUPPORTED');
    });

    it('should return INVALID for missing providerEventId (svix-id)', () => {
      const result = adapter.parsePayload(createPayload('email.delivered', { email_id: 'msg_123', to: 'test@test.com' }), {});
      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('svix-id');
      }
    });

    it('should return INVALID for missing providerMessageId (email_id)', () => {
      const result = adapter.parsePayload(createPayload('email.delivered', { to: 'test@test.com' }), validHeaders);
      expect(result.status).toBe('INVALID');
      if (result.status === 'INVALID') {
        expect(result.reason).toContain('email_id');
      }
    });
  });
});
