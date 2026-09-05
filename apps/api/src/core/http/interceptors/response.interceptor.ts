import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';
import { buildSuccessResponse } from '@tiles-erp/shared';
import type { ApiSuccessResponse } from '@tiles-erp/shared-types';
import { getTraceId } from '../trace';

/** Wraps every successful controller result in the standard API success envelope. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((data) =>
        buildSuccessResponse(data, {
          statusCode: response.statusCode,
          message: 'OK',
          path: request.originalUrl,
          traceId: getTraceId(request),
        }),
      ),
    );
  }
}
