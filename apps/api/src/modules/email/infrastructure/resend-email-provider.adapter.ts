import { Injectable, Logger, Optional, Inject, HttpStatus } from '@nestjs/common';
import {
  EmailProviderAdapter,
  SendEmailInput,
  SendEmailResult,
  EmailDispatchErrorCode,
} from '../domain/email-provider.adapter';
import type { ResendCredentials } from '../domain/provider-credentials';
import { AppValidationException, AppException } from '../../../common/errors/application.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { MessageIdGenerator } from '../domain/message-id.generator';

export class EmailProviderException extends AppException {
  constructor(message: string, public readonly dispatchErrorCode: EmailDispatchErrorCode, details?: Record<string, unknown>) {
    super(message, HttpStatus.BAD_GATEWAY, ErrorCode.PROVIDER_FAILURE, { ...details, dispatchErrorCode });
  }
}

@Injectable()
export class ResendEmailProviderAdapter implements EmailProviderAdapter<ResendCredentials> {
  public readonly provider = 'RESEND';
  private readonly logger = new Logger(ResendEmailProviderAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    @Optional() @Inject('RESEND_BASE_URL') baseUrl?: string,
    @Optional() @Inject('RESEND_TIMEOUT_MS') timeoutMs = 15000,
  ) {
    this.baseUrl = baseUrl || process.env.RESEND_BASE_URL || 'https://api.resend.com';
    this.timeoutMs = timeoutMs;
  }

  async sendEmail(input: SendEmailInput<ResendCredentials>): Promise<SendEmailResult> {
    if (!input.credentials || !input.credentials.apiKey) {
      throw new EmailProviderException('Resend API key is missing', EmailDispatchErrorCode.PROVIDER_REJECTED);
    }

    const rfcMessageId = MessageIdGenerator.generate(input.fromEmail);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.credentials.apiKey}`,
      'Idempotency-Key': input.idempotencyKey,
    };

    const replyDomain = process.env.REPLY_EMAIL_DOMAIN || 'reply.outreacher.local';
    
    // Primary Reply-To is the token correlation address
    let finalReplyTo = `reply+${input.replyToToken}@${replyDomain}`;
    // The plan states: "If a custom SenderAccount.replyTo is present, it is recorded in the send metadata for downstream routing, but never replaces the correlation token header."

    const bodyPayload: Record<string, unknown> = {
      from: `${input.fromName} <${input.fromEmail}>`,
      to: [input.toEmail],
      subject: input.subject,
      text: input.bodyText,
      reply_to: finalReplyTo,
      headers: {
        'Message-ID': rfcMessageId,
      },
    };

    if (input.bodyHtml) {
      bodyPayload.html = input.bodyHtml;
    }

    try {
      const response = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new EmailProviderException('Rate limit exceeded', EmailDispatchErrorCode.PROVIDER_RATE_LIMIT);
        }

        const errorBody = await response.text();
        this.logger.error(`Resend API error (${response.status}): ${errorBody}`);

        let parsedMessage = `Resend returned status ${response.status}`;
        let parsedName = '';
        try {
          const parsed = JSON.parse(errorBody) as { message?: string; name?: string };
          if (parsed.message) parsedMessage = parsed.message;
          if (parsed.name) parsedName = parsed.name;
        } catch {}

        // Handle 409 idempotency conflict
        if (response.status === 409 && parsedName === 'conflict') {
          // It's a conflict because we already sent it with this idempotency key and it succeeded.
          // In reality, resend doesn't expose the message id on a 409 easily, but for our idempotency recovery, 
          // we treat it as success if we need to. But Resend API spec says:
          // Wait, the plan says: "Provider (Resend) returns 409 conflict with existing message ID. Worker marks EmailSend = SENT and job = COMPLETED."
          let messageIdFromConflict = null;
          try {
             const parsed = JSON.parse(errorBody);
             if (parsed.id) {
               messageIdFromConflict = parsed.id;
             }
          } catch {}
          if (!messageIdFromConflict) {
             throw new EmailProviderException('Idempotency conflict but no message ID returned', EmailDispatchErrorCode.PROVIDER_IDEMPOTENCY_CONFLICT, { statusCode: 409 });
          }
          return { providerMessageId: messageIdFromConflict, messageId: rfcMessageId };
        }

        throw new EmailProviderException(parsedMessage, EmailDispatchErrorCode.PROVIDER_REJECTED, { statusCode: response.status });
      }

      const data = (await response.json()) as { id: string };
      return {
        providerMessageId: data.id,
        messageId: rfcMessageId,
      };
    } catch (error: any) {
      if (error instanceof EmailProviderException) {
        throw error;
      }

      if (error.name === 'AbortError') {
        throw new EmailProviderException('Provider request timed out post-submit', EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN);
      }

      // In Node.js fetch, system network errors are exposed via error.cause
      if (error.cause) {
        const sysCode = error.cause.code;
        if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'].includes(sysCode)) {
          throw new EmailProviderException(`Pre-submit connection failure: ${sysCode}`, EmailDispatchErrorCode.PROVIDER_CONNECT_FAILURE);
        }
        if (['ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(sysCode)) {
          // Socket broke during transit or server aborted without response.
          // This implies the request left the socket but the outcome is unknown.
          throw new EmailProviderException(`Post-submit socket failure: ${sysCode}`, EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN);
        }
      }

      throw new EmailProviderException(`Email provider dispatch failed: ${error?.message || 'Unknown'}`, EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
