import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@tiles-erp/config';
import type { NotificationChannel } from '@tiles-erp/shared-types';

interface NotificationPayload {
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * Consumes the `notification` queue. In-app notifications are the foundation channel;
 * email/sms/push routing is added as those integrations are implemented.
 */
@Processor(QUEUE_NAMES.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job<NotificationPayload>): Promise<void> {
    const { userId, channel, title } = job.data;
    this.logger.log(`Dispatching ${channel} notification "${title}" to user ${userId}`);
  }
}
