import { Injectable } from '@nestjs/common';
import {
  IConnectionTester,
  ConnectionTestResult,
} from '../domain/connection-tester.interface';
import type { ProviderCredentials } from '../../email/domain/provider-credentials';

@Injectable()
export class ResendConnectionTester implements IConnectionTester {
  public async testConnection(
    credentials: ProviderCredentials,
  ): Promise<ConnectionTestResult> {
    if (credentials.provider !== 'RESEND') {
      return { success: false, reason: 'INVALID_CREDENTIALS' };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      }

      // Resend specifically returns 400 for validation errors (which means the token worked)
      if (response.status === 400 || response.status === 422) {
        return { success: true };
      }

      if (response.status === 401 || response.status === 403) {
        return { success: false, reason: 'INVALID_CREDENTIALS' };
      }

      // 429, 5xx, or anything else
      return { success: false, reason: 'PROVIDER_UNAVAILABLE' };
    } catch (error) {
      return { success: false, reason: 'CONNECTION_FAILED' };
    }
  }
}
