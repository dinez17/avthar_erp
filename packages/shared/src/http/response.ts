import type {
  ApiErrorResponse,
  ApiFieldError,
  ApiSuccessResponse,
  Paginated,
  PaginationMeta,
} from '@tiles-erp/shared-types';

export interface ResponseContext {
  statusCode: number;
  message: string;
  path: string;
  traceId: string;
}

export const buildSuccessResponse = <T>(
  data: T,
  ctx: ResponseContext,
): ApiSuccessResponse<T> => ({
  success: true,
  statusCode: ctx.statusCode,
  message: ctx.message,
  data,
  timestamp: new Date().toISOString(),
  path: ctx.path,
  traceId: ctx.traceId,
});

export const buildErrorResponse = (
  ctx: ResponseContext & { errorCode: string; errors?: ApiFieldError[] },
): ApiErrorResponse => ({
  success: false,
  statusCode: ctx.statusCode,
  message: ctx.message,
  errorCode: ctx.errorCode,
  errors: ctx.errors,
  timestamp: new Date().toISOString(),
  path: ctx.path,
  traceId: ctx.traceId,
});

export const buildPaginationMeta = (
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationMeta => {
  const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0;
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
};

export const buildPaginated = <T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): Paginated<T> => ({
  items,
  meta: buildPaginationMeta(page, pageSize, totalItems),
});
