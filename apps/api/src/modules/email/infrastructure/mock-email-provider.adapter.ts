import { Injectable } from '@nestjs/common';
import { EmailProviderAdapter, ProviderCredentials, SendEmailInput, SendEmailResult } from '../domain/email-provider.adapter';
import { MessageIdGenerator } from '../domain/message-id.generator';
import { randomUUID } from 'crypto';

@Injectable()
export class MockEmailProviderAdapter implements EmailProviderAdapter<ProviderCredentials> {
  public readonly provider = 'MOCK';
  
  public calls: SendEmailInput[] = [];

  async sendEmail(input: SendEmailInput<ProviderCredentials>): Promise<SendEmailResult> {
    this.calls.push(input);
    const rfcMessageId = MessageIdGenerator.generate(input.fromEmail);
    
    return {
      providerMessageId: `mock-msg-${randomUUID()}`,
      messageId: rfcMessageId,
    };
  }
}
