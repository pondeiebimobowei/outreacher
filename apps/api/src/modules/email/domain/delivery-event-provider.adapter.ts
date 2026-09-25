import { EmailEventType } from '@repo/db';

export interface CanonicalDeliveryEvent {
  providerEventId: string;
  providerMessageId: string;
  recipientEmail: string;
  eventType: EmailEventType;
  occurredAt: Date;
  rawPayload: Record<string, unknown>;
}

export type ParseDeliveryEventResult =
  | { status: 'VALID'; event: CanonicalDeliveryEvent }
  | { status: 'UNSUPPORTED'; reason: string }
  | { status: 'INVALID'; reason: string };

export interface WebhookVerificationContext {
  rawBody: Buffer;
  headers: Record<string, string>;
  secret: string;
}

export abstract class DeliveryEventProviderAdapter {
  abstract readonly provider: string;

  /**
   * Verifies the cryptographic signature of the webhook payload.
   * Throws an appropriate AppValidationException if invalid.
   */
  abstract verifySignature(context: WebhookVerificationContext): void;

  /**
   * Parses the webhook payload into a CanonicalDeliveryEvent, an UNSUPPORTED status, or an INVALID status.
   */
  abstract parsePayload(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ParseDeliveryEventResult;
}
