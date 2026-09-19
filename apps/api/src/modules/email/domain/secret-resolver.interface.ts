import type { ProviderCredentials } from './provider-credentials';

export const SECRET_RESOLVER_TOKEN = 'ISecretResolver';

export interface ISecretResolver {
  resolve(secretReference: string, provider: string): Promise<ProviderCredentials>;
}
