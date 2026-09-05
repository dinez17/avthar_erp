import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from './env.validation';
import { buildConfig, CONFIG_TOKEN, type AppConfig } from './configuration';
import type { AppEnv } from '@tiles-erp/validation';

/**
 * Global configuration module. Validates the environment once and exposes a
 * strongly-typed {@link AppConfig} object under {@link CONFIG_TOKEN}.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [
    {
      provide: CONFIG_TOKEN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): AppConfig => {
        const env: AppEnv = {
          NODE_ENV: configService.getOrThrow('NODE_ENV'),
          DATABASE_URL: configService.getOrThrow('DATABASE_URL'),
          REDIS_HOST: configService.getOrThrow('REDIS_HOST'),
          REDIS_PORT: configService.getOrThrow('REDIS_PORT'),
          REDIS_PASSWORD: configService.get('REDIS_PASSWORD'),
          API_PORT: configService.getOrThrow('API_PORT'),
          API_GLOBAL_PREFIX: configService.getOrThrow('API_GLOBAL_PREFIX'),
          API_CORS_ORIGINS: configService.getOrThrow('API_CORS_ORIGINS'),
          SWAGGER_ENABLED: configService.getOrThrow('SWAGGER_ENABLED'),
          API_HTTPS: configService.get('API_HTTPS') ?? false,
          API_SSL_KEY_FILE: configService.get('API_SSL_KEY_FILE'),
          API_SSL_CERT_FILE: configService.get('API_SSL_CERT_FILE'),
          JWT_ACCESS_SECRET: configService.getOrThrow('JWT_ACCESS_SECRET'),
          JWT_ACCESS_EXPIRES_IN: configService.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
          JWT_REFRESH_SECRET: configService.getOrThrow('JWT_REFRESH_SECRET'),
          JWT_REFRESH_EXPIRES_IN: configService.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
          WORKER_CONCURRENCY: configService.getOrThrow('WORKER_CONCURRENCY'),
          SMTP_HOST: configService.getOrThrow('SMTP_HOST'),
          SMTP_PORT: configService.getOrThrow('SMTP_PORT'),
          SMTP_SECURE: configService.getOrThrow('SMTP_SECURE'),
          SMTP_USER: configService.get('SMTP_USER'),
          SMTP_PASSWORD: configService.get('SMTP_PASSWORD'),
          SMTP_FROM: configService.getOrThrow('SMTP_FROM'),
          UPLOAD_DIR: configService.getOrThrow('UPLOAD_DIR'),
          UPLOAD_MAX_FILE_SIZE: configService.getOrThrow('UPLOAD_MAX_FILE_SIZE'),
          SIXORBIT_ENC_KEY: configService.get('SIXORBIT_ENC_KEY'),
        };
        return buildConfig(env);
      },
    },
  ],
  exports: [CONFIG_TOKEN],
})
export class AppConfigModule {}
