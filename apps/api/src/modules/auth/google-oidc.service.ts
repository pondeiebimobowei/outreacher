import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import {
  AppUnauthorizedException,
  AppValidationException,
} from '../../common/errors/application.exception';
import { ErrorCode } from '../../common/errors/error-codes';

export interface GoogleUserInfo {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleOidcService {
  private readonly logger = new Logger(GoogleOidcService.name);

  constructor(private readonly configService: ConfigService) {}

  generatePkce() {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  generateState(): string {
    return randomBytes(16).toString('hex');
  }

  buildAuthorizationUrl(state: string, codeChallenge: string): string {
    const clientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID') ||
      'mock-google-client-id';
    const redirectUri =
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:3000/api/v1/auth/google/callback';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Validate Google ID Token assertions (issuer, audience/client_id, signature, expiration, email_verified).
   */
  async validateIdToken(
    idToken: string,
    expectedClientId: string,
  ): Promise<GoogleUserInfo> {
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );

    if (!tokenInfoRes.ok) {
      throw new AppValidationException(
        ErrorCode.VALIDATION_ERROR,
        // 'Invalid or unverifiable Google ID token signature.',
        // 400,
      );
    }

    const claims = (await tokenInfoRes.json()) as {
      iss?: string;
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      exp?: string | number;
      name?: string;
      picture?: string;
    };

    // 1. Issuer verification
    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!claims.iss || !validIssuers.includes(claims.iss)) {
      throw new AppValidationException(
        `Invalid ID token issuer assertion: ${claims.iss ?? 'missing'}`,
      );
    }

    // 2. Audience / Client ID verification
    if (claims.aud !== expectedClientId) {
      throw new AppValidationException(
        'ID token audience does not match application client_id.',
      );
    }

    // 3. Expiration verification
    const expNum =
      typeof claims.exp === 'string' ? parseInt(claims.exp, 10) : claims.exp;
    if (!expNum || expNum < Math.floor(Date.now() / 1000)) {
      throw new AppValidationException('ID token has expired.');
    }

    // 4. Email verification & required identity claims
    const isEmailVerified =
      claims.email_verified === true || claims.email_verified === 'true';

    if (!isEmailVerified || !claims.sub || !claims.email) {
      throw new AppUnauthorizedException(
        'Google account email is not verified.',
      );
    }

    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: true,
      name: claims.name,
      picture: claims.picture,
    };
  }

  /**
   * Exchange code for ID token and extract/validate user identity assertions.
   * In test environment or when code starts with 'mock_code_', returns mock identity.
   */
  async exchangeCodeAndGetUserInfo(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleUserInfo> {
    const isTest = this.configService.get<string>('NODE_ENV') === 'test';

    if (isTest || code.startsWith('mock_code_')) {
      this.logger.log('Mocking Google OIDC token exchange in test mode');
      const mockSub = code.startsWith('mock_code_')
        ? code.replace('mock_code_', '')
        : 'mock-google-sub-12345';
      const mockEmail = `google-${mockSub}@example.com`;

      return {
        sub: mockSub,
        email: mockEmail,
        emailVerified: true,
        name: `Google User ${mockSub}`,
      };
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_CALLBACK_URL');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new AppValidationException(
        'Google OAuth client credentials are not configured.',
      );
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Google token exchange failed: ${errText}`);
        throw new AppValidationException(
          'Failed to exchange authorization code with Google.',
        );
      }

      const tokenData = (await response.json()) as { id_token?: string };
      if (!tokenData.id_token) {
        throw new AppValidationException(
          'Google token response missing id_token.',
        );
      }

      // Strictly validate ID token assertions (issuer, audience, expiration, signature, email_verified)
      return await this.validateIdToken(tokenData.id_token, clientId);
    } catch (err) {
      if (
        err instanceof AppValidationException ||
        err instanceof AppUnauthorizedException
      ) {
        throw err;
      }
      this.logger.error('Error during Google OIDC exchange', err);
      throw new AppValidationException('Google OIDC authentication failed.');
    }
  }
}
