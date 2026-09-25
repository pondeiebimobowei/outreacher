import { IntegrationProvider } from '@repo/db';
import type { ProviderCredentials } from '../../email/domain/provider-credentials';

export interface ConnectionTestResult {
  success: boolean;
  reason?: string;
}

export const CONNECTION_TESTER_REGISTRY_TOKEN = Symbol(
  'CONNECTION_TESTER_REGISTRY_TOKEN',
);

export interface IConnectionTester {
  testConnection(
    credentials: ProviderCredentials,
  ): Promise<ConnectionTestResult>;
}

export interface IConnectionTesterRegistry {
  getTester(provider: IntegrationProvider): IConnectionTester;
}
