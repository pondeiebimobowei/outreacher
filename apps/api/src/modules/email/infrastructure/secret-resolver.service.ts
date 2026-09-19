import { Injectable } from '@nestjs/common';
import { ISecretResolver } from '../domain/secret-resolver.interface';
import { ProviderCredentials, ResendCredentials, SesCredentials, SmtpCredentials } from '../domain/email-provider.adapter';
import { AppValidationException } from '../../../common/errors/application.exception';

@Injectable()
export class SecretResolverService implements ISecretResolver {
  async resolve(secretReference: string, provider: string): Promise<ProviderCredentials> {
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
          // Assuming val is JSON for SES
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

    throw new AppValidationException(`Unsupported secret reference format: ${secretReference}`);
  }
}
