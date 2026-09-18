import { Injectable, Logger } from '@nestjs/common';
import {
  EmailProviderException,
  EmailRateLimitException,
  EmailTimeoutException,
  IEmailSender,
  SendEmailInput,
  SendEmailResult,
} from '../domain/email-sender.interface';
import { MessageIdGenerator } from '../domain/message-id.generator';

@Injectable()
export class ResendEmailSender implements IEmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(apiKey?: string, baseUrl?: string, timeoutMs = 15000) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY || '';
    this.baseUrl =
      baseUrl || process.env.RESEND_BASE_URL || 'https://api.resend.com';
    this.timeoutMs = timeoutMs;
  }

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.apiKey) {
      throw new EmailProviderException('Resend API key is not configured');
    }

    const rfcMessageId = MessageIdGenerator.generate(input.fromEmail);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'Idempotency-Key': input.idempotencyKey,
    };

    const replyDomain =
      process.env.REPLY_EMAIL_DOMAIN || 'reply.outreacher.local';
    const replyTo = input.replyToToken
      ? `reply-${input.replyToToken}@${replyDomain}`
      : undefined;

    const bodyPayload: Record<string, unknown> = {
      from: input.fromEmail,
      to: [input.toEmail],
      subject: input.subject,
      text: input.bodyText,
      headers: {
        'Message-ID': rfcMessageId,
      },
    };

    if (input.bodyHtml) {
      bodyPayload.html = input.bodyHtml;
    }

    if (replyTo) {
      bodyPayload.reply_to = replyTo;
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
          throw new EmailRateLimitException();
        }

        const errorBody = await response.text();
        this.logger.error(
          `Resend API error (${response.status}): ${errorBody}`,
        );

        let parsedMessage = `Resend returned status ${response.status}`;
        try {
          const parsed = JSON.parse(errorBody) as {
            message?: string;
            name?: string;
          };
          if (parsed.message) {
            parsedMessage = parsed.message;
          }
        } catch {
          // Keep default message if non-JSON
        }

        throw new EmailProviderException(parsedMessage, {
          statusCode: response.status,
          idempotencyKey: input.idempotencyKey,
        });
      }

      const data = (await response.json()) as { id: string };
      if (!data || !data.id) {
        throw new EmailProviderException(
          'Resend returned success without provider message ID',
        );
      }

      return {
        providerMessageId: data.id,
        rfcMessageId,
        sentAt: new Date(),
      };
    } catch (error: unknown) {
      if (
        error instanceof EmailProviderException ||
        error instanceof EmailRateLimitException ||
        error instanceof EmailTimeoutException
      ) {
        throw error;
      }

      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('abort'))
      ) {
        throw new EmailTimeoutException();
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown provider error';
      this.logger.error(`Network or unexpected Resend error: ${errorMessage}`);
      throw new EmailProviderException(
        `Email provider dispatch failed: ${errorMessage}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
