export interface CanonicalInboundReply {
  providerMessageId: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  replyToToken: string | null;
  fromName: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: Date;
}

export interface WebhookVerificationContext {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  secret: string;
}

export abstract class InboundEmailProviderAdapter {
  /**
   * Verifies the cryptographic signature of the webhook.
   * Throws an exception if invalid.
   */
  abstract verifySignature(context: WebhookVerificationContext): void;

  /**
   * Parses the validated raw body into a canonical inbound reply.
   */
  abstract parsePayload(rawBody: Buffer): CanonicalInboundReply;
}
