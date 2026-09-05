import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

/**
 * Structured application logger. Emits JSON in production for log aggregation and
 * a human-readable format in development. Extends Nest's ConsoleLogger so it can be
 * used as the framework logger and injected into services alike.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  private get json(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private emit(level: string, message: unknown, context?: string): void {
    if (!this.json) return;
    const payload = {
      level,
      time: new Date().toISOString(),
      context: context ?? this.context,
      message,
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  override log(message: unknown, context?: string): void {
    if (this.json) return this.emit('info', message, context);
    super.log(message as string, context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    if (this.json) return this.emit('error', { message, stack }, context);
    super.error(message as string, stack, context);
  }

  override warn(message: unknown, context?: string): void {
    if (this.json) return this.emit('warn', message, context);
    super.warn(message as string, context);
  }

  override debug(message: unknown, context?: string): void {
    if (this.json) return this.emit('debug', message, context);
    super.debug(message as string, context);
  }
}
