import { Injectable } from '@nestjs/common';
import { EmailProviderAdapter } from '../domain/email-provider.adapter';
import type { ProviderCredentials } from '../domain/provider-credentials';
import { ResendEmailProviderAdapter } from './resend-email-provider.adapter';
import { MockEmailProviderAdapter } from './mock-email-provider.adapter';

@Injectable()
export class EmailProviderRegistry {
  private adapters = new Map<string, EmailProviderAdapter>();

  constructor(
    private readonly resendAdapter: ResendEmailProviderAdapter,
    private readonly mockAdapter: MockEmailProviderAdapter
  ) {
    this.adapters.set('RESEND', this.resendAdapter);
    if (process.env.NODE_ENV !== 'production') {
      this.adapters.set('MOCK', this.mockAdapter);
    }
  }

  getAdapter(provider: string): EmailProviderAdapter<ProviderCredentials> | undefined {
    return this.adapters.get(provider);
  }

  hasAdapter(provider: string): boolean {
    return this.adapters.has(provider);
  }
}
