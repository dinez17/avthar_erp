import type { AppEnv } from '@tiles-erp/validation';

/** Strongly-typed configuration tree consumed via ConfigService. */
export interface AppConfig {
  env: AppEnv['NODE_ENV'];
  http: {
    port: number;
    globalPrefix: string;
    corsOrigins: string[];
    swaggerEnabled: boolean;
    https: boolean;
    sslKeyFile?: string;
    sslCertFile?: string;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  redis: { host: string; port: number; password?: string };
  worker: { concurrency: number };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
  upload: { dir: string; maxFileSize: number };
  /**
   * The only SixOrbit secret held in the environment. Base URL, key, email and password
   * live in the database so they can be changed without a redeploy.
   */
  sixorbit: { encKey?: string };
}

export const buildConfig = (env: AppEnv): AppConfig => ({
  env: env.NODE_ENV,
  http: {
    port: env.API_PORT,
    globalPrefix: env.API_GLOBAL_PREFIX,
    corsOrigins: env.API_CORS_ORIGINS.split(',').map((o) => o.trim()),
    swaggerEnabled: env.SWAGGER_ENABLED,
    https: env.API_HTTPS,
    sslKeyFile: env.API_SSL_KEY_FILE,
    sslCertFile: env.API_SSL_CERT_FILE,
  },
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  redis: { host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD },
  worker: { concurrency: env.WORKER_CONCURRENCY },
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM,
  },
  upload: { dir: env.UPLOAD_DIR, maxFileSize: env.UPLOAD_MAX_FILE_SIZE },
  sixorbit: { encKey: env.SIXORBIT_ENC_KEY },
});

export const CONFIG_TOKEN = 'APP_CONFIG';
