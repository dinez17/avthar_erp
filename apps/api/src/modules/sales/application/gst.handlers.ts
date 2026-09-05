import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { Gstr1Return, GstSummary, UUID } from '@tiles-erp/shared-types';
import { GST_REPOSITORY, type GstRepository } from '../domain/gst.repository';
import { resolveWindow } from './dashboard.handlers';

export class Gstr1ReturnQuery {
  constructor(
    public readonly from?: string,
    public readonly to?: string,
    public readonly branchId?: UUID,
  ) {}
}

export class GstSummaryQuery {
  constructor(
    public readonly from?: string,
    public readonly to?: string,
    public readonly branchId?: UUID,
  ) {}
}

@QueryHandler(GstSummaryQuery)
export class GstSummaryHandler implements IQueryHandler<GstSummaryQuery, GstSummary> {
  constructor(@Inject(GST_REPOSITORY) private readonly gst: GstRepository) {}

  execute(query: GstSummaryQuery): Promise<GstSummary> {
    // Same window rules as the dashboard: a default month, and never over a year.
    const window = resolveWindow(query.from, query.to);
    return this.gst.summary({ ...window, branchId: query.branchId });
  }
}

@QueryHandler(Gstr1ReturnQuery)
export class Gstr1ReturnHandler implements IQueryHandler<Gstr1ReturnQuery, Gstr1Return> {
  constructor(@Inject(GST_REPOSITORY) private readonly gst: GstRepository) {}

  execute(query: Gstr1ReturnQuery): Promise<Gstr1Return> {
    const window = resolveWindow(query.from, query.to);
    return this.gst.returnData({ ...window, branchId: query.branchId });
  }
}
