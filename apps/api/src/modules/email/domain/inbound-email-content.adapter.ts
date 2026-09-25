import { ProviderCredentials } from './provider-credentials';

export interface InboundEmailDetails {
  providerEmailId: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  text: string | null;
  html: string | null;
}

export interface InboundEmailContentAdapter<
  TCredentials extends ProviderCredentials,
> {
  getEmailDetails(
    providerEmailId: string,
    credentials: TCredentials,
  ): Promise<InboundEmailDetails>;
}

export const INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN =
  'INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN';

export interface IInboundEmailContentAdapterRegistry {
  getAdapter(provider: string): InboundEmailContentAdapter<ProviderCredentials>;
}
