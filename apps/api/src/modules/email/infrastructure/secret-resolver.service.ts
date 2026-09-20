import { Injectable } from '@nestjs/common';
import { ISecretResolver } from '../domain/secret-resolver.interface';
import { ProviderCredentials, ResendCredentials, SesCredentials, SmtpCredentials } from '../domain/provider-credentials';
import { AppValidationException, SystemConfigurationException, SecretResolutionException } from '../../../common/errors/application.exception';

@Injectable()
export class SecretResolverService implements ISecretResolver {
  private client: any = null;
  private isAuthenticating = false;
  private authWaiters: Array<(client: any) => void> = [];
  private authErrors: Array<(err: any) => void> = [];

  private isAuthenticationFailure(error: any): boolean {
    if (!error) return false;
    const status = error.status ?? error.statusCode ?? error.response?.status ?? error.response?.statusCode;
    if (status === 401) return true;
    if (error.message && typeof error.message === 'string' && error.message.includes('401')) return true;
    return false;
  }

  private async getClientAuth(forceRecover = false): Promise<any> {
    if (this.client && !forceRecover && !this.isAuthenticating) {
      return this.client;
    }

    if (this.isAuthenticating) {
      return new Promise((resolve, reject) => {
        this.authWaiters.push(resolve);
        this.authErrors.push(reject);
      });
    }

    this.isAuthenticating = true;

    try {
      if (this.client && forceRecover) {
        try {
          await this.client.auth().universalAuth.renew();
        } catch (renewErr) {
          // If renew fails, clear client to trigger full login immediately below
          this.client = null;
        }
      }

      if (!this.client) {
        const { InfisicalSDK } = require('@infisical/sdk');
        const clientId = process.env.INFISICAL_CLIENT_ID;
        const clientSecret = process.env.INFISICAL_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          throw new SystemConfigurationException('Infisical bootstrap credentials missing');
        }

        this.client = new InfisicalSDK();
        await this.client.auth().universalAuth.login({
          clientId,
          clientSecret,
        });
      }

      const client = this.client;
      this.isAuthenticating = false;
      this.authWaiters.forEach((resolve) => resolve(client));
      this.authWaiters = [];
      this.authErrors = [];
      return client;
    } catch (err) {
      this.client = null;
      this.isAuthenticating = false;
      let finalErr = err;
      if (!(err instanceof SystemConfigurationException)) {
        finalErr = new SecretResolutionException('Failed to authenticate to vault');
      }
      this.authErrors.forEach((reject) => reject(finalErr));
      this.authWaiters = [];
      this.authErrors = [];
      throw finalErr;
    }
  }

  private async executeGetSecret(client: any, environment: string, projectId: string, secretPath: string, secretName: string): Promise<string> {
    try {
      const secret = await client.secrets().getSecret({
        environment,
        projectId,
        path: secretPath,
        secretName,
      });
      if (!secret || !secret.secretValue) {
        throw new SecretResolutionException('SecretMissingException');
      }
      return secret.secretValue;
    } catch (error: any) {
      if (error instanceof SecretResolutionException) throw error;

      const status = error.status ?? error.statusCode ?? error.response?.status;
      if (status === 404 || (error.message && error.message.includes('404'))) {
        throw new SecretResolutionException('SecretMissingException');
      }
      throw error;
    }
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
        case 'WEBHOOK': return { provider: 'WEBHOOK', secret: val } as any;
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
        throw new SystemConfigurationException('Infisical environment config missing');
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

      if (!secretName || secretName.trim() === '') {
        throw new AppValidationException(`Invalid secret name`);
      }

      const expectedPrefix = `/workspaces/${workspaceId}/`;
      if (!secretPath.startsWith(expectedPrefix)) {
        throw new AppValidationException(`Workspace isolation violation`);
      }

      try {
        let client = await this.getClientAuth(false);
        let val: string;

        try {
          val = await this.executeGetSecret(client, environment, projectId, secretPath, secretName);
        } catch (e: any) {
          if (e instanceof SecretResolutionException && e.message === 'SecretMissingException') {
            throw e; // Let outer block handle this as a resolution failure
          }
          
          if (this.isAuthenticationFailure(e)) {
            client = await this.getClientAuth(true);
            val = await this.executeGetSecret(client, environment, projectId, secretPath, secretName);
          } else {
            throw e;
          }
        }

        switch (provider) {
          case 'WEBHOOK': return { provider: 'WEBHOOK', secret: val } as any;
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
        if (e instanceof AppValidationException || e instanceof SystemConfigurationException || e instanceof SecretResolutionException) {
          throw e;
        }
        throw new SecretResolutionException('Failed to resolve vault secret');
      }
    }

    throw new AppValidationException('Unsupported secret reference format');
  }
}
