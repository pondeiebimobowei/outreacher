import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/application.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

export const EMAIL_SENDER_TOKEN = 'IEmailSender';

export interface SendEmailInput {
  workspaceId: string;
  campaignMemberId: string;
  toEmail: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  replyToToken?: string;
  idempotencyKey: string;
}

export interface SendEmailResult {
  providerMessageId: string;
  rfcMessageId: string;
  sentAt: Date;
}

export interface IEmailSender {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}

export class EmailProviderException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, HttpStatus.BAD_GATEWAY, ErrorCode.PROVIDER_FAILURE, details);
  }
}

export class EmailTimeoutException extends AppException {
  constructor(message = 'Email provider request timed out') {
    super(message, HttpStatus.GATEWAY_TIMEOUT, ErrorCode.PROVIDER_FAILURE, {
      timeout: true,
    });
  }
}

export class EmailRateLimitException extends AppException {
  constructor(message = 'Email provider rate limit exceeded') {
    super(message, HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED);
  }
}
