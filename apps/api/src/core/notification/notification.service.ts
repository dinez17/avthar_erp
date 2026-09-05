import { Injectable } from '@nestjs/common';
import { AppLogger } from '../logger/app-logger.service';
import { QueueService } from '../queue/queue.service';
import type { NotificationJobData } from './notification.types';

/**
 * Application-facing notification dispatcher. Enqueues notifications for asynchronous
 * delivery by the worker. Channel-specific delivery lives in the worker processors.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly queue: QueueService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('NotificationService');
  }

  async dispatch(data: NotificationJobData): Promise<void> {
    await this.queue.enqueueNotification(data);
    this.logger.log(`Queued ${data.channel} notification for user ${data.userId}`);
  }
}
