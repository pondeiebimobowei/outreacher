import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().optional(),
    AUTH_SECRET: z
      .string()
      .min(16, 'AUTH_SECRET must be at least 16 characters long')
      .default('development_auth_secret_min_16_chars'),
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
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formattedErrors = JSON.stringify(result.error.format(), null, 2);
    throw new Error(`Invalid environment configuration:\n${formattedErrors}`);
  }
  return result.data;
}
