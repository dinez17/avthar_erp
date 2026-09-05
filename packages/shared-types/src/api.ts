import type { SortOrder } from './common';

/** Standard success envelope returned by every API endpoint. */
export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
  traceId: string;
}

/** Standard error envelope returned by the global exception filter. */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errorCode: string;
  errors?: ApiFieldError[];
  timestamp: string;
  path: string;
  traceId: string;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Query parameters accepted by any paginated list endpoint. */
export interface PaginationQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
  search?: string;
}

/** Metadata describing a page of results. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** Envelope for a paginated collection. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}
