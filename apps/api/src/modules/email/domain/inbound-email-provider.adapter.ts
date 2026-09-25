export interface CanonicalInboundReply {
  providerEventId: string;
  providerEmailId: string | null;
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
  abstract verifySignature(context: WebhookVerificationContext): void;
  abstract parsePayload(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): CanonicalInboundReply;
}
