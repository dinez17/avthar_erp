import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CONFIG_TOKEN, type AppConfig } from '../config/configuration';
import { QUEUE_NAMES } from '@tiles-erp/config';
import { QueueService } from './queue.service';

/**
 * Registers the shared BullMQ connection and the foundation queues. Business modules
 * register additional queues with BullModule.registerQueue in their own module.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [CONFIG_TOKEN],
      useFactory: (config: AppConfig) => ({
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password || undefined,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.AUDIT },
    ),
  ],
  providers: [QueueService],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
