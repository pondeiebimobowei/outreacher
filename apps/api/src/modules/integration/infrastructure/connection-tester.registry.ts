import { Injectable } from '@nestjs/common';
import { IntegrationProvider } from '@repo/db';
import { AppValidationException } from '../../../common/errors/application.exception';
import {
  IConnectionTester,
  IConnectionTesterRegistry,
} from '../domain/connection-tester.interface';
import { ResendConnectionTester } from './resend-connection-tester';

@Injectable()
export class ConnectionTesterRegistry implements IConnectionTesterRegistry {
  constructor(private readonly resendTester: ResendConnectionTester) {}

  public getTester(provider: IntegrationProvider): IConnectionTester {
    if (provider === IntegrationProvider.RESEND) {
      return this.resendTester;
    }
    throw new AppValidationException(
      `Provider ${provider} is coming later and currently unsupported.`,
    );
  }
}
