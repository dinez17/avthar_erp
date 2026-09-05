import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import type {
  DriverCashReport,
  FreightCollectionReport,
  PendingDispatchAgeReport,
  UUID,
  VehicleRunningReport,
} from '@tiles-erp/shared-types';
import {
  DISPATCH_REPORT_REPOSITORY,
  type DispatchReportRepository,
  type DispatchReportWindow,
} from '../domain/dispatch-report.repository';

const DAY = 24 * 60 * 60 * 1000;
const MAX_WINDOW_DAYS = 366;

/**
 * Turns the dates on the query string into a window, defaulting to the last thirty days.
 *
 * The upper bound is a year: these reports read every gate pass in the period and its
 * documents, and an unbounded range would be a slow way to lock a table.
 */
export function resolveWindow(from?: string, to?: string, branchId?: UUID): DispatchReportWindow {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 29 * DAY);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('Those dates could not be read');
  }
  if (start > end) throw new ValidationError('The From date is after the To date');
  if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * DAY) {
    throw new ValidationError('Choose a period of a year or less');
  }
  return { from: start, to: end, branchId };
}

export class FreightCollectionQuery {
  constructor(
    public readonly from?: string,
    public readonly to?: string,
    public readonly branchId?: UUID,
  ) {}
}

export class VehicleRunningQuery {
  constructor(
    public readonly from?: string,
    public readonly to?: string,
    public readonly branchId?: UUID,
  ) {}
}

export class DriverCashQuery {
  constructor(
    public readonly from?: string,
    public readonly to?: string,
    public readonly branchId?: UUID,
  ) {}
}

export class PendingAgeingQuery {
  constructor(public readonly branchId?: UUID) {}
}

@QueryHandler(FreightCollectionQuery)
export class FreightCollectionHandler
  implements IQueryHandler<FreightCollectionQuery, FreightCollectionReport>
{
  constructor(
    @Inject(DISPATCH_REPORT_REPOSITORY) private readonly reports: DispatchReportRepository,
  ) {}

  execute(query: FreightCollectionQuery): Promise<FreightCollectionReport> {
    return this.reports.freightCollection(resolveWindow(query.from, query.to, query.branchId));
  }
}

@QueryHandler(VehicleRunningQuery)
export class VehicleRunningHandler
  implements IQueryHandler<VehicleRunningQuery, VehicleRunningReport>
{
  constructor(
    @Inject(DISPATCH_REPORT_REPOSITORY) private readonly reports: DispatchReportRepository,
  ) {}

  execute(query: VehicleRunningQuery): Promise<VehicleRunningReport> {
    return this.reports.vehicleRunning(resolveWindow(query.from, query.to, query.branchId));
  }
}

@QueryHandler(DriverCashQuery)
export class DriverCashHandler implements IQueryHandler<DriverCashQuery, DriverCashReport> {
  constructor(
    @Inject(DISPATCH_REPORT_REPOSITORY) private readonly reports: DispatchReportRepository,
  ) {}

  execute(query: DriverCashQuery): Promise<DriverCashReport> {
    return this.reports.driverCash(resolveWindow(query.from, query.to, query.branchId));
  }
}

@QueryHandler(PendingAgeingQuery)
export class PendingAgeingHandler
  implements IQueryHandler<PendingAgeingQuery, PendingDispatchAgeReport>
{
  constructor(
    @Inject(DISPATCH_REPORT_REPOSITORY) private readonly reports: DispatchReportRepository,
  ) {}

  execute(query: PendingAgeingQuery): Promise<PendingDispatchAgeReport> {
    return this.reports.pendingAgeing(query.branchId);
  }
}
