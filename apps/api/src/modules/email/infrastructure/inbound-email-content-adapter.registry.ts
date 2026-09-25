import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  IInboundEmailContentAdapterRegistry,
  InboundEmailContentAdapter,
} from '../domain/inbound-email-content.adapter';
import { ProviderCredentials } from '../domain/provider-credentials';
import { ResendInboundContentAdapter } from './resend-inbound-content.adapter';
import { AppValidationException } from '../../../common/errors/application.exception';

@Injectable()
export class InboundEmailContentAdapterRegistry implements IInboundEmailContentAdapterRegistry {
  constructor(private readonly resendAdapter: ResendInboundContentAdapter) {}

  getAdapter(
    provider: string,
  ): InboundEmailContentAdapter<ProviderCredentials> {
    if (provider === 'RESEND') {
      return this.resendAdapter;
    }

    throw new AppValidationException(
      `Provider ${provider} does not support inbound content retrieval`,
    );
  }
}
