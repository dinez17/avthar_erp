import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type {
  LowStockItem,
  Paginated,
  PaginationQuery,
  StockAgeingItem,
  StockAgeingSummary,
  StockValuationItem,
  StockValuationSummary,
} from '@tiles-erp/shared-types';
import {
  STOCK_REPORTS_REPOSITORY,
  type ReportFilter,
  type StockReportsRepository,
} from '../domain/reports.repository';

export class StockValuationQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: ReportFilter,
  ) {}
}

export class StockAgeingQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: ReportFilter,
  ) {}
}

export class LowStockQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: ReportFilter,
  ) {}
}

@QueryHandler(StockValuationQuery)
export class StockValuationHandler
  implements
    IQueryHandler<StockValuationQuery, Paginated<StockValuationItem> & { summary: StockValuationSummary }>
{
  constructor(
    @Inject(STOCK_REPORTS_REPOSITORY) private readonly reports: StockReportsRepository,
  ) {}

  execute(
    query: StockValuationQuery,
  ): Promise<Paginated<StockValuationItem> & { summary: StockValuationSummary }> {
    return this.reports.valuation(query.pagination, query.filter);
  }
}

@QueryHandler(StockAgeingQuery)
export class StockAgeingHandler
  implements
    IQueryHandler<StockAgeingQuery, Paginated<StockAgeingItem> & { summary: StockAgeingSummary }>
{
  constructor(
    @Inject(STOCK_REPORTS_REPOSITORY) private readonly reports: StockReportsRepository,
  ) {}

  execute(
    query: StockAgeingQuery,
  ): Promise<Paginated<StockAgeingItem> & { summary: StockAgeingSummary }> {
    return this.reports.ageing(query.pagination, query.filter);
  }
}

@QueryHandler(LowStockQuery)
export class LowStockHandler implements IQueryHandler<LowStockQuery, Paginated<LowStockItem>> {
  constructor(
    @Inject(STOCK_REPORTS_REPOSITORY) private readonly reports: StockReportsRepository,
  ) {}

  execute(query: LowStockQuery): Promise<Paginated<LowStockItem>> {
    return this.reports.lowStock(query.pagination, query.filter);
  }
}
