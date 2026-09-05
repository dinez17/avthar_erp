import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import { ValidationError } from '@tiles-erp/shared';
import type {
  BulkSetStockResult,
  Paginated,
  StockBalanceItem,
  StockMovementItem,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  BulkSetStockCommand,
  ListCountSheetQuery,
  ListStockBalancesQuery,
  ListStockMovementsQuery,
  PostAdjustmentCommand,
  PostOpeningStockCommand,
} from '../application/stock.handlers';
import {
  BulkSetStockDto,
  PostAdjustmentDto,
  PostOpeningStockDto,
  StockBalanceQueryDto,
  StockMovementQueryDto,
} from './dto/stock.dto';

@ApiTags('Stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('balances')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Current stock on hand by product, godown, batch and shade' })
  balances(@Query() query: StockBalanceQueryDto): Promise<Paginated<StockBalanceItem>> {
    return this.queryBus.execute(
      new ListStockBalancesQuery(query, {
        branchId: query.branchId,
        godownId: query.godownId,
        productId: query.productId,
        brandId: query.brandId,
        categoryId: query.categoryId,
        batchNo: query.batchNo,
        shade: query.shade,
        nonZeroOnly: query.nonZeroOnly ?? true,
        groupByProduct: query.groupByProduct ?? false,
      }),
    );
  }

  @Get('count-sheet')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({
    summary: 'Count sheet for a godown: every product listed, including those with no stock',
  })
  countSheet(@Query() query: StockBalanceQueryDto): Promise<Paginated<StockBalanceItem>> {
    if (!query.branchId || !query.godownId) {
      throw new ValidationError('branchId and godownId are required for a count sheet');
    }
    return this.queryBus.execute(
      new ListCountSheetQuery(query.branchId, query.godownId, query, {
        productId: query.productId,
        brandId: query.brandId,
        categoryId: query.categoryId,
        batchNo: query.batchNo,
        shade: query.shade,
      }),
    );
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Stock ledger, newest first' })
  movements(@Query() query: StockMovementQueryDto): Promise<Paginated<StockMovementItem>> {
    return this.queryBus.execute(
      new ListStockMovementsQuery(query, {
        branchId: query.branchId,
        godownId: query.godownId,
        productId: query.productId,
        type: query.type,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
      }),
    );
  }

  @Post('opening')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_OPENING)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Post opening stock for a branch (once per product/godown)' })
  async opening(
    @Body() dto: PostOpeningStockDto,
    @CurrentUser('id') actorId: string,
  ): Promise<{ posted: number }> {
    const posted = await this.commandBus.execute(new PostOpeningStockCommand(dto, actorId));
    return { posted };
  }

  @Post('count')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({
    summary: 'Set counted stock levels in bulk; adjustments are posted for the differences',
  })
  count(
    @Body() dto: BulkSetStockDto,
    @CurrentUser('id') actorId: string,
  ): Promise<BulkSetStockResult> {
    return this.commandBus.execute(new BulkSetStockCommand(dto, actorId));
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Post a stock adjustment (positive or negative lines)' })
  async adjust(
    @Body() dto: PostAdjustmentDto,
    @CurrentUser('id') actorId: string,
  ): Promise<{ posted: number }> {
    const posted = await this.commandBus.execute(new PostAdjustmentCommand(dto, actorId));
    return { posted };
  }
}
