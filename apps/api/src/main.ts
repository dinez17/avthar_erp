import 'reflect-metadata';
import { networkInterfaces } from 'node:os';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppLogger } from './core/logger/app-logger.service';
import { CONFIG_TOKEN, type AppConfig } from './core/config/configuration';
import { setupSwagger } from './swagger';
import { loadHttpsCredentials } from './core/https';

/** Matches http(s) origins on localhost or RFC1918 private ranges (LAN devices). */
const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

/**
 * Builds the CORS origin predicate. `*` in API_CORS_ORIGINS allows any origin;
 * `lan` additionally allows localhost and private-network hosts so phones and other
 * machines on the same Wi-Fi can use the app during development.
 */
function buildCorsOrigin(
  configured: string[],
): boolean | string[] | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  if (configured.includes('*')) return true;
  const allowLan = configured.includes('lan');
  const explicit = configured.filter((o) => o !== 'lan');
  if (!allowLan) return explicit;
  return (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, explicit.includes(origin) || PRIVATE_ORIGIN.test(origin));
  };
}

/** IPv4 addresses of non-internal interfaces, for the startup banner. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

async function bootstrap(): Promise<void> {
  // TLS options must be resolved before the app is created, so read the raw env here.
  const useHttps = process.env.API_HTTPS === 'true';
  const httpsOptions = useHttps
    ? loadHttpsCredentials(process.env.API_SSL_KEY_FILE, process.env.API_SSL_CERT_FILE)
    : undefined;

  const app = await NestFactory.create(AppModule, { bufferLogs: true, httpsOptions });

  const logger = await app.resolve(AppLogger);
  logger.setContext('Bootstrap');
  app.useLogger(logger);

  const config = app.get<AppConfig>(CONFIG_TOKEN);

  app.setGlobalPrefix(config.http.globalPrefix);
  app.use(helmet());
  app.use(compression());
  app.enableCors({ origin: buildCorsOrigin(config.http.corsOrigins), credentials: true });
  app.enableShutdownHooks();

  if (config.http.swaggerEnabled) {
    setupSwagger(app, config.http.globalPrefix);
  }

  // Bind to all interfaces so other devices on the LAN can reach the API.
  await app.listen(config.http.port, '0.0.0.0');

  const prefix = config.http.globalPrefix;
  const scheme = useHttps ? 'https' : 'http';
  logger.log(`API listening on ${scheme}://localhost:${config.http.port}/${prefix}`);
  for (const address of lanAddresses()) {
    logger.log(`           network  ${scheme}://${address}:${config.http.port}/${prefix}`);
  }
  logger.log(`CORS origins: ${config.http.corsOrigins.join(', ')}`);
}

void bootstrap();
