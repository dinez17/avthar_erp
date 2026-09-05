import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AppConfigModule } from './config/app-config.module';
import { LoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.module';
import { NumberingModule } from './numbering/numbering.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { EmailModule } from './email/email.module';
import { NotificationModule } from './notification/notification.module';
import { UploadModule } from './upload/upload.module';

/**
 * Aggregates all cross-cutting infrastructure (the "common" layer). Every provider it
 * exports is global, so feature modules can inject them without re-importing.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    NumberingModule,
    RedisModule,
    QueueModule,
    EmailModule,
    NotificationModule,
    UploadModule,
    CqrsModule.forRoot(),
  ],
})
export class CoreModule {}
