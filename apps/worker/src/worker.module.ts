import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@tiles-erp/config';
import { WORKER_CONFIG, loadWorkerConfig, type WorkerConfig } from './config/worker-config';
import { PrismaService } from './prisma.service';
import { MailerService } from './processors/mailer.service';
import { EmailProcessor } from './processors/email.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { AuditProcessor } from './processors/audit.processor';
import { SixOrbitProcessor } from './processors/sixorbit.processor';
import { sixOrbitProviders } from './sixorbit/sixorbit.providers';

const configProvider = {
  provide: WORKER_CONFIG,
  useFactory: (): WorkerConfig => loadWorkerConfig().config,
};

/** Root module for the background worker. Registers the BullMQ connection and processors. */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const { config } = loadWorkerConfig();
        return {
          connection: {
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password || undefined,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.AUDIT },
      { name: QUEUE_NAMES.SIXORBIT },
    ),
  ],
  providers: [
    configProvider,
    PrismaService,
    MailerService,
    EmailProcessor,
    NotificationProcessor,
    AuditProcessor,
    ...sixOrbitProviders,
    SixOrbitProcessor,
  ],
})
export class WorkerModule {}
