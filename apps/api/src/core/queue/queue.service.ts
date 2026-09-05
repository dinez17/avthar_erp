import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@tiles-erp/config';
import type { EmailJobData } from '../email/email.types';
import type { NotificationJobData } from '../notification/notification.types';

/** Convenience façade for enqueuing foundation background jobs. */
@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue<EmailJobData>,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION)
    private readonly notificationQueue: Queue<NotificationJobData>,
  ) {}

  async enqueueEmail(data: EmailJobData): Promise<void> {
    await this.emailQueue.add('send', data);
  }

  async enqueueNotification(data: NotificationJobData): Promise<void> {
    await this.notificationQueue.add('dispatch', data);
  }
}
