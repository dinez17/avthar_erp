import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import type { DashboardSummary, UUID } from '@tiles-erp/shared-types';
import {
  DASHBOARD_REPOSITORY,
  type DashboardRepository,
} from '../domain/dashboard.repository';

/** How far back the overview looks when the caller does not say. */
const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;

export class DashboardSummaryQuery {
  constructor(
    public readonly from?: string,
    public readonly to?: string,
    public readonly branchId?: UUID,
  ) {}
}

/**
 * Works out the window the overview covers: the last 30 days unless the caller gives
 * dates, and never more than a year so one page cannot scan the whole ledger.
 */
export function resolveWindow(from?: string, to?: string): { from: Date; to: Date } {
  const end = to ? new Date(to) : new Date();
  const start = from
    ? new Date(from)
    : new Date(end.getTime() - (DEFAULT_DAYS - 1) * 24 * 60 * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('Those dates could not be read');
  }
  if (start > end) throw new ValidationError('The start date is after the end date');

  const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (days > MAX_DAYS) throw new ValidationError('Choose a window of a year or less');

  return { from: start, to: end };
}

@QueryHandler(DashboardSummaryQuery)
export class DashboardSummaryHandler
  implements IQueryHandler<DashboardSummaryQuery, DashboardSummary>
{
  constructor(@Inject(DASHBOARD_REPOSITORY) private readonly dashboard: DashboardRepository) {}

  execute(query: DashboardSummaryQuery): Promise<DashboardSummary> {
    const window = resolveWindow(query.from, query.to);
    return this.dashboard.summary({ ...window, branchId: query.branchId });
  }
}
