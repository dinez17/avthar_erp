import { envSchema, type AppEnv } from '@tiles-erp/validation';

export interface WorkerConfig {
  redis: { host: string; port: number; password?: string };
  concurrency: number;
  /** The only SixOrbit secret in the environment; the rest is in sixorbit_config. */
  sixorbit: { encKey?: string };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
}

export const WORKER_CONFIG = 'WORKER_CONFIG';

export const loadWorkerConfig = (): { env: AppEnv; config: WorkerConfig } => {
  const env = envSchema.parse(process.env);
  return {
    env,
    config: {
      redis: { host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD },
      concurrency: env.WORKER_CONCURRENCY,
      sixorbit: { encKey: env.SIXORBIT_ENC_KEY },
      smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.SMTP_FROM,
      },
    },
  };
};
