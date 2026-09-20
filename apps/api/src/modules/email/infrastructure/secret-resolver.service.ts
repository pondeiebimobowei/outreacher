import { Injectable } from '@nestjs/common';
import { ISecretResolver } from '../domain/secret-resolver.interface';
import { ProviderCredentials, ResendCredentials, SesCredentials, SmtpCredentials } from '../domain/provider-credentials';
import { AppValidationException } from '../../../common/errors/application.exception';

@Injectable()
export class SecretResolverService implements ISecretResolver {
  private client: any = null;
  private authPromise: Promise<void> | null = null;

  private async getInfisicalClient(): Promise<any> {
    const { InfisicalSDK } = require('@infisical/sdk');

    const clientId = process.env.INFISICAL_CLIENT_ID;
    const clientSecret = process.env.INFISICAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(`SystemConfigurationException: Infisical bootstrap credentials missing`);
    }

    if (this.client && this.authPromise) {
      await this.authPromise;
      return this.client;
    }

    this.client = new InfisicalSDK();
    this.authPromise = this.client.auth().universalAuth.login({
      clientId,
      clientSecret,
    }).catch(() => {
      // Clear the promise so subsequent attempts can retry
      this.client = null;
      this.authPromise = null;
      throw new Error('SecretResolutionException: Failed to authenticate to vault');
    });

    await this.authPromise;
    return this.client;
  }

  async resolve(workspaceId: string, secretReference: string, provider: string): Promise<ProviderCredentials> {
    if (secretReference.startsWith('mock://')) {
      if (process.env.NODE_ENV === 'production') {
        throw new AppValidationException('mock:// secrets are not allowed in production');
      }
      return { provider: provider as any, apiKey: 'mock-key' } as any;
    }

    if (secretReference.startsWith('env://')) {
      const envVar = secretReference.replace('env://', '');
      const val = process.env[envVar];
      if (!val) {
        throw new AppValidationException(`Secret environment variable ${envVar} not found`);
      }
      
      switch (provider) {
        case 'RESEND':
          return { provider: 'RESEND', apiKey: val } as ResendCredentials;
        case 'SES':
          const sesData = JSON.parse(val);
          return {
            provider: 'SES',
            accessKeyId: sesData.accessKeyId,
            secretAccessKey: sesData.secretAccessKey,
            region: sesData.region,
          } as SesCredentials;
        case 'SMTP':
          const smtpData = JSON.parse(val);
          return {
            provider: 'SMTP',
            host: smtpData.host,
            port: smtpData.port,
            user: smtpData.user,
            pass: smtpData.pass,
            secure: smtpData.secure,
          } as SmtpCredentials;
        default:
          throw new AppValidationException(`Unsupported provider: ${provider}`);
      }
    }

    if (secretReference.startsWith('vault://')) {
      const projectId = process.env.INFISICAL_PROJECT_ID;
      const environment = process.env.INFISICAL_ENVIRONMENT;

      if (!projectId || !environment) {
        throw new Error(`SystemConfigurationException: Infisical environment config missing`);
      }

      const withoutScheme = secretReference.replace('vault://', '');
      const parts = withoutScheme.split('#');
      if (parts.length !== 2) {
        throw new AppValidationException('Invalid vault:// reference grammar');
      }

      const [secretPath, secretName] = parts;

      if (!secretPath || secretPath.includes('\\') || secretPath.includes('..') || secretPath.includes('//')) {
        throw new AppValidationException(`Invalid secret path format`);
      }

      const expectedPrefix = `/workspaces/${workspaceId}/`;
      if (!secretPath.startsWith(expectedPrefix)) {
        throw new AppValidationException(`Workspace isolation violation`);
      }

      try {
        const client = await this.getInfisicalClient();

        const secret = await client.secrets().getSecret({
          environment,
          projectId,
          path: secretPath,
          secretName,
        });

        if (!secret || !secret.secretValue) {
          throw new Error('SecretMissingException');
        }

        const val = secret.secretValue;

        switch (provider) {
          case 'RESEND':
            return { provider: 'RESEND', apiKey: val } as ResendCredentials;
          case 'SES':
            const sesData = JSON.parse(val);
            return {
              provider: 'SES',
              accessKeyId: sesData.accessKeyId,
              secretAccessKey: sesData.secretAccessKey,
              region: sesData.region,
            } as SesCredentials;
          case 'SMTP':
            const smtpData = JSON.parse(val);
            return {
              provider: 'SMTP',
              host: smtpData.host,
              port: smtpData.port,
              user: smtpData.user,
              pass: smtpData.pass,
              secure: smtpData.secure,
            } as SmtpCredentials;
          default:
            throw new AppValidationException(`Unsupported provider: ${provider}`);
        }
      } catch (e: any) {
        if (e instanceof AppValidationException) throw e;
        throw new Error(`SecretResolutionException: Failed to resolve vault secret`);
      }
    }

    throw new AppValidationException(`Unsupported secret reference format: ${secretReference}`);
  }
}
