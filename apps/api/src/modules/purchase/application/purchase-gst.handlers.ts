import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import type { PurchaseGstSummary, TaxPosition, UUID } from '@tiles-erp/shared-types';
import {
  PURCHASE_GST_REPOSITORY,
  type PurchaseGstRepository,
  type PurchaseGstWindow,
} from '../domain/purchase-gst.repository';

const DAY = 24 * 60 * 60 * 1000;
const MAX_WINDOW_DAYS = 366;

/**
 * The period a GST report covers, defaulting to the current calendar month — which is
 * how a return period is chosen, so it is what the page should open on.
 */
export function resolveGstWindow(
  from?: string,
  to?: string,
  branchId?: UUID,
): PurchaseGstWindow {
  const now = new Date();
  const start = from
    ? new Date(from)
    : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = to ? new Date(to) : now;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('Those dates could not be read');
  }
  if (start > end) throw new ValidationError('The From date is after the To date');
  if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * DAY) {
    throw new ValidationError('Choose a period of a year or less');
  }
  return { from: start, to: end, branchId };
}

export class PurchaseGstSummaryQuery {
  constructor(
    public readonly from?: string,
    public readonly to?: string,
    public readonly branchId?: UUID,
  ) {}
}

export class TaxPositionQuery {
  constructor(
    public readonly from?: string,
    public readonly to?: string,
    public readonly branchId?: UUID,
  ) {}
}

@QueryHandler(PurchaseGstSummaryQuery)
export class PurchaseGstSummaryHandler
  implements IQueryHandler<PurchaseGstSummaryQuery, PurchaseGstSummary>
{
  constructor(
    @Inject(PURCHASE_GST_REPOSITORY) private readonly gst: PurchaseGstRepository,
  ) {}

  execute(query: PurchaseGstSummaryQuery): Promise<PurchaseGstSummary> {
    return this.gst.summary(resolveGstWindow(query.from, query.to, query.branchId));
  }
}

@QueryHandler(TaxPositionQuery)
export class TaxPositionHandler implements IQueryHandler<TaxPositionQuery, TaxPosition> {
  constructor(
    @Inject(PURCHASE_GST_REPOSITORY) private readonly gst: PurchaseGstRepository,
  ) {}

  execute(query: TaxPositionQuery): Promise<TaxPosition> {
    return this.gst.position(resolveGstWindow(query.from, query.to, query.branchId));
  }
}
