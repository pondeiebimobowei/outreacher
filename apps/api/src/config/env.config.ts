import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    AUTH_SECRET: z
      .string()
      .min(16, 'AUTH_SECRET must be at least 16 characters long')
      .default('development_auth_secret_min_16_chars'),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z
      .string()
      .optional()
      .default('http://localhost:3000/api/v1/auth/google/callback'),
    FRONTEND_URL: z.string().optional().default('http://localhost:5173'),
  })
  .refine(
    (data) => {
      if (
        data.NODE_ENV === 'production' &&
        data.AUTH_SECRET === 'development_auth_secret_min_16_chars'
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        'AUTH_SECRET must be explicitly set to a secure secret in production environment.',
      path: ['AUTH_SECRET'],
    },
  );

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const nodeEnv = (config.NODE_ENV || process.env.NODE_ENV) as
    string | undefined;
  const isTest = nodeEnv === 'test';
  const testDbUrl = process.env.TEST_DATABASE_URL;
  const rawDbUrl =
    isTest && testDbUrl && testDbUrl.trim() !== ''
      ? testDbUrl
      : config.DATABASE_URL || process.env.DATABASE_URL;

  const mergedConfig = {
    ...config,
    DATABASE_URL:
      typeof rawDbUrl === 'string' && rawDbUrl.trim() !== ''
        ? rawDbUrl
        : undefined,
  };
  const result = envSchema.safeParse(mergedConfig);
  if (!result.success) {
    const formattedErrors = JSON.stringify(result.error.format(), null, 2);
    throw new Error(`Invalid environment configuration:\n${formattedErrors}`);
  }
  return result.data;
}
