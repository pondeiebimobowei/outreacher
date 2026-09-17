import { ConfigService } from '@nestjs/config';
import { ApplicationException } from '../../common/errors/application.exception';
import { GoogleOidcService } from './google-oidc.service';

describe('GoogleOidcService Security Assertions', () => {
  let service: GoogleOidcService;
  let mockConfigService: Partial<ConfigService>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID')
          return 'test-client-id.apps.googleusercontent.com';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'test-client-secret';
        if (key === 'GOOGLE_CALLBACK_URL')
          return 'http://localhost:3000/api/v1/auth/google/callback';
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      }),
    };

    service = new GoogleOidcService(mockConfigService as ConfigService);
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  it('generatePkce should return codeVerifier and S256 codeChallenge', () => {
    const pkce = service.generatePkce();
    expect(pkce.codeVerifier).toBeDefined();
    expect(pkce.codeChallenge).toBeDefined();
    expect(pkce.codeVerifier.length).toBeGreaterThan(30);
  });

  it('validateIdToken should pass for valid Google ID token claims', async () => {
    const validClaims = {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id.apps.googleusercontent.com',
      sub: 'google-user-id-123',
      email: 'verified@example.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: 'Verified User',
    };

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => validClaims,
    } as Response);

    const user = await service.validateIdToken(
      'valid-id-token',
      'test-client-id.apps.googleusercontent.com',
    );

    expect(user.sub).toBe('google-user-id-123');
    expect(user.email).toBe('verified@example.com');
    expect(user.emailVerified).toBe(true);
  });

  it('validateIdToken should reject invalid issuer assertion', async () => {
    const invalidIssuerClaims = {
      iss: 'https://malicious-issuer.com',
      aud: 'test-client-id.apps.googleusercontent.com',
      sub: 'google-user-id-123',
      email: 'user@example.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => invalidIssuerClaims,
    } as Response);

    await expect(
      service.validateIdToken(
        'token-with-bad-issuer',
        'test-client-id.apps.googleusercontent.com',
      ),
    ).rejects.toThrow(ApplicationException);
  });

  it('validateIdToken should reject audience / client_id mismatch', async () => {
    const badAudienceClaims = {
      iss: 'https://accounts.google.com',
      aud: 'different-app-client-id.apps.googleusercontent.com',
      sub: 'google-user-id-123',
      email: 'user@example.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => badAudienceClaims,
    } as Response);

    await expect(
      service.validateIdToken(
        'token-with-bad-aud',
        'test-client-id.apps.googleusercontent.com',
      ),
    ).rejects.toThrow(ApplicationException);
  });

  it('validateIdToken should reject expired ID token', async () => {
    const expiredClaims = {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id.apps.googleusercontent.com',
      sub: 'google-user-id-123',
      email: 'user@example.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) - 600, // Expired 10 min ago
    };

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => expiredClaims,
    } as Response);

    await expect(
      service.validateIdToken(
        'expired-token',
        'test-client-id.apps.googleusercontent.com',
      ),
    ).rejects.toThrow(ApplicationException);
  });

  it('validateIdToken should reject unverified email (email_verified == false)', async () => {
    const unverifiedClaims = {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id.apps.googleusercontent.com',
      sub: 'google-user-id-123',
      email: 'unverified@example.com',
      email_verified: false,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => unverifiedClaims,
    } as Response);

    await expect(
      service.validateIdToken(
        'token-unverified-email',
        'test-client-id.apps.googleusercontent.com',
      ),
    ).rejects.toThrow(ApplicationException);
  });
});
