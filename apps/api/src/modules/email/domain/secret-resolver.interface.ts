import { ProviderCredentials } from './email-provider.adapter';

export const SECRET_RESOLVER_TOKEN = 'ISecretResolver';

export interface ISecretResolver {
  resolve(secretReference: string, provider: string): Promise<ProviderCredentials>;
}
