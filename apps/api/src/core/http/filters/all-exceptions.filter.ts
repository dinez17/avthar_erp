import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, buildErrorResponse } from '@tiles-erp/shared';
import type { ApiFieldError } from '@tiles-erp/shared-types';
import { AppLogger } from '../../logger/app-logger.service';
import { getTraceId } from '../trace';

/** Converts any thrown error into the standard API error envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('ExceptionFilter');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const traceId = getTraceId(request);

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';
    let errors: ApiFieldError[] | undefined;

    if (exception instanceof AppError) {
      statusCode = exception.statusCode;
      message = exception.message;
      errorCode = exception.errorCode;
      errors = exception.fieldErrors;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as { message?: string | string[]; error?: string };
        message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? message);
        errorCode = (body.error ?? errorCode).toString().toUpperCase().replace(/\s+/g, '_');
        if (Array.isArray(body.message)) {
          errors = body.message.map((m) => ({ field: '_', message: m }));
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${statusCode} [${traceId}]`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(statusCode).json(
      buildErrorResponse({
        statusCode,
        message,
        errorCode,
        errors,
        path: request.originalUrl,
        traceId,
      }),
    );
  }
}
