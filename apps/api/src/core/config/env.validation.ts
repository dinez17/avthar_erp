import { envSchema, type AppEnv } from '@tiles-erp/validation';

/**
 * Validates process environment against the shared Zod schema at bootstrap.
 * Throwing here prevents the application from starting with invalid configuration.
 */
export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
