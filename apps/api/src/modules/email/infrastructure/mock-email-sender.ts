import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  EmailProviderException,
  IEmailSender,
  SendEmailInput,
  SendEmailResult,
} from '../domain/email-sender.interface';
import { MessageIdGenerator } from '../domain/message-id.generator';

@Injectable()
export class MockEmailSender implements IEmailSender {
  public sentEmails: SendEmailInput[] = [];
  public shouldFail = false;
  public failureError?: Error;

  public async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.sentEmails.push({ ...input });

    if (this.shouldFail) {
      if (this.failureError) {
        throw this.failureError;
      }
      throw new EmailProviderException('Mock email sender configured to fail');
    }

    const providerMessageId = `mock_re_${randomUUID()}`;
    const rfcMessageId = MessageIdGenerator.generate(input.fromEmail);

    return {
      providerMessageId,
      rfcMessageId,
      sentAt: new Date(),
    };
  }

  public reset(): void {
    this.sentEmails = [];
    this.shouldFail = false;
    this.failureError = undefined;
  }
}
