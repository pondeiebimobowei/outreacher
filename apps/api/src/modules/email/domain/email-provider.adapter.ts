import type { ProviderCredentials } from './provider-credentials';

export interface SendEmailInput<T extends ProviderCredentials = ProviderCredentials> {
  workspaceId: string;
  senderAccountId: string;
  campaignMemberId: string;
  emailSendId: string;
  toEmail: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  replyToToken: string;
  idempotencyKey: string;
  credentials: T;
}

export interface SendEmailResult {
  providerMessageId: string | null;
  messageId?: string;
}

export interface EmailProviderAdapter<T extends ProviderCredentials = ProviderCredentials> {
  readonly provider: string;
  sendEmail(input: SendEmailInput<T>): Promise<SendEmailResult>;
}

export enum EmailDispatchErrorCode {
  PROVIDER_TIMEOUT_UNCERTAIN = 'PROVIDER_TIMEOUT_UNCERTAIN',
  PROVIDER_REJECTED = 'PROVIDER_REJECTED',
  PROVIDER_RATE_LIMIT = 'PROVIDER_RATE_LIMIT',
  PROVIDER_UNSUPPORTED = 'PROVIDER_UNSUPPORTED',
  SENDER_CAPACITY_EXCEEDED = 'SENDER_CAPACITY_EXCEEDED',
  DISPATCH_ATTEMPTS_EXHAUSTED = 'DISPATCH_ATTEMPTS_EXHAUSTED',
  PROVIDER_CONNECT_FAILURE = 'PROVIDER_CONNECT_FAILURE',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  PROVIDER_IDEMPOTENCY_CONFLICT = 'PROVIDER_IDEMPOTENCY_CONFLICT',
}
