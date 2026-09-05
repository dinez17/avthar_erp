import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker-config';
import type { EmailJobData } from '@tiles-erp/shared-types';

/** Owns the SMTP transport. Email delivery lives exclusively in the worker. */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;

  constructor(@Inject(WORKER_CONFIG) private readonly config: WorkerConfig) {
    this.transporter = createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    });
  }

  async deliver(data: EmailJobData): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.smtp.from,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      html: data.html,
      text: data.text,
    });
    this.logger.log(`Delivered email: ${data.subject}`);
  }
}
