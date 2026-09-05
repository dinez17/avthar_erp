import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type {
  LowStockItem,
  Paginated,
  StockAgeingItem,
  StockAgeingSummary,
  StockValuationItem,
  StockValuationSummary,
} from '@tiles-erp/shared-types';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  LowStockQuery,
  StockAgeingQuery,
  StockValuationQuery,
} from '../application/reports.handlers';
import { StockBalanceQueryDto } from './dto/stock.dto';

@ApiTags('Stock reports')
@ApiBearerAuth()
@Controller('stock/reports')
export class StockReportsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('valuation')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Stock valuation at landing cost, with totals for the filtered set' })
  valuation(
    @Query() query: StockBalanceQueryDto,
  ): Promise<Paginated<StockValuationItem> & { summary: StockValuationSummary }> {
    return this.queryBus.execute(
      new StockValuationQuery(query, {
        branchId: query.branchId,
        godownId: query.godownId,
        brandId: query.brandId,
        categoryId: query.categoryId,
        groupByProduct: query.groupByProduct ?? false,
      }),
    );
  }

  @Get('ageing')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Stock ageing by days since last inward movement' })
  ageing(
    @Query() query: StockBalanceQueryDto,
  ): Promise<Paginated<StockAgeingItem> & { summary: StockAgeingSummary }> {
    return this.queryBus.execute(
      new StockAgeingQuery(query, {
        branchId: query.branchId,
        godownId: query.godownId,
        brandId: query.brandId,
        categoryId: query.categoryId,
      }),
    );
  }

  @Get('low-stock')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Products at or below their reorder level' })
  lowStock(@Query() query: StockBalanceQueryDto): Promise<Paginated<LowStockItem>> {
    return this.queryBus.execute(
      new LowStockQuery(query, {
        branchId: query.branchId,
        brandId: query.brandId,
        categoryId: query.categoryId,
      }),
    );
  }
}
