import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@tiles-erp/config';
import type { EmailJobData } from '@tiles-erp/shared-types';
// Deliberately NOT `import type`. Nest resolves this constructor parameter from the
// metadata TypeScript emits, and a type-only import is erased at runtime — leaving
// `Function` in its place, which Nest cannot resolve. The lint rule that prefers
// `import type` must not be applied to a class used for constructor injection.
import { MailerService } from './mailer.service';

/** Consumes the `email` queue and delivers messages over SMTP. */
@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly mailer: MailerService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    this.logger.log(`Processing email job ${job.id}`);
    await this.mailer.deliver(job.data);
  }
}
