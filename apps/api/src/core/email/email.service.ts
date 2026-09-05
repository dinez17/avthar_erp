import { Injectable } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';
import type { EmailJobData } from './email.types';

/**
 * Application-facing email facade. Transactional email is delivered asynchronously by the
 * worker; this service enqueues the job so request handlers never block on SMTP.
 */
@Injectable()
export class EmailService {
  constructor(private readonly queue: QueueService) {}

  async send(data: EmailJobData): Promise<void> {
    await this.queue.enqueueEmail(data);
  }
}
