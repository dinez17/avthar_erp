import { z } from 'zod';

/** Runtime environment contract validated at API/worker bootstrap. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  API_PORT: z.coerce.number().int().default(3000),
  API_GLOBAL_PREFIX: z.string().default('api'),
  API_CORS_ORIGINS: z.string().default('http://localhost:5173'),
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Serve the API over HTTPS; required when the PWAs are served over HTTPS. */
  API_HTTPS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Optional certificate paths; a self-signed pair is generated when omitted. */
  API_SSL_KEY_FILE: z.string().optional(),
  API_SSL_CERT_FILE: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  WORKER_CONCURRENCY: z.coerce.number().int().default(5),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Tiles ERP <no-reply@tileserp.local>'),
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_FILE_SIZE: z.coerce.number().int().default(10485760),
  /**
   * Encrypts the SixOrbit password held in the database — 32 bytes, base64.
   *
   * The credentials themselves live in `sixorbit_config` so they can be changed from the
   * settings screen without a redeploy. This key stays in the environment on purpose: a
   * stolen database dump alone must not be enough to read the password back.
   *
   * Generate with: openssl rand -base64 32
   */
  SIXORBIT_ENC_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'must be 32 bytes encoded as base64 (openssl rand -base64 32)',
    })
    .optional(),
});

export type AppEnv = z.infer<typeof envSchema>;
