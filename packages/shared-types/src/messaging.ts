/** Payload for an email job placed on the `email` queue and delivered by the worker. */
export interface EmailJobData {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
}

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';

/** Payload for a notification job placed on the `notification` queue. */
export interface NotificationJobData {
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}
