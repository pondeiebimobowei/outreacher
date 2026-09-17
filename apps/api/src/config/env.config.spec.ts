import { validateEnv } from './env.config';

describe('Environment Configuration Validation', () => {
  const validDbUrl =
    'postgresql://user:postgres@localhost:5432/outreacher_dev?schema=public';

  it('should validate valid development configuration', () => {
    const config = {
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: validDbUrl,
      AUTH_SECRET: 'development_auth_secret_min_16_chars',
    };

    const validated = validateEnv(config);
    expect(validated.NODE_ENV).toBe('development');
    expect(validated.PORT).toBe(3000);
    expect(validated.AUTH_SECRET).toBe('development_auth_secret_min_16_chars');
  });

  it('should throw clear failure when AUTH_SECRET is too short', () => {
    const config = {
      DATABASE_URL: validDbUrl,
      AUTH_SECRET: 'short_secret',
    };

    expect(() => validateEnv(config)).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('should throw clear failure when NODE_ENV is invalid', () => {
    const config = {
      DATABASE_URL: validDbUrl,
      NODE_ENV: 'invalid_env',
    };

    expect(() => validateEnv(config)).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('should throw clear failure in production when fallback AUTH_SECRET is used', () => {
    const config = {
      NODE_ENV: 'production',
      DATABASE_URL: validDbUrl,
      AUTH_SECRET: 'development_auth_secret_min_16_chars',
    };

    expect(() => validateEnv(config)).toThrow(
      /AUTH_SECRET must be explicitly set to a secure secret in production/,
    );
  });

  it('should validate valid production configuration with explicit AUTH_SECRET', () => {
    const config = {
      NODE_ENV: 'production',
      DATABASE_URL: validDbUrl,
      AUTH_SECRET: 'production_super_secret_key_123456789',
    };

    const validated = validateEnv(config);
    expect(validated.NODE_ENV).toBe('production');
    expect(validated.AUTH_SECRET).toBe('production_super_secret_key_123456789');
  });
});
