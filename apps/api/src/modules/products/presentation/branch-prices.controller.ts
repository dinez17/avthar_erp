import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type { BranchPriceItem, Paginated } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  BulkUpdateBranchPricesCommand,
  ListBranchPricesQuery,
} from '../application/branch-prices.handlers';
import {
  BranchPriceListQueryDto,
  BulkUpdateBranchPricesDto,
} from './dto/branch-price.dto';

@ApiTags('Branch prices')
@ApiBearerAuth()
@Controller('branch-prices')
export class BranchPricesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRICE_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List products with selling prices for one branch' })
  list(@Query() query: BranchPriceListQueryDto): Promise<Paginated<BranchPriceItem>> {
    return this.queryBus.execute(
      new ListBranchPricesQuery(query.branchId, query, {
        categoryId: query.categoryId,
        brandId: query.brandId,
        seriesId: query.seriesId,
        sizeMm: query.sizeMm,
      }),
    );
  }

  @Patch('bulk')
  @RequirePermissions(PERMISSIONS.PRICE_UPDATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Bulk set display / minimum / actual selling prices for a branch' })
  bulkUpdate(
    @Body() dto: BulkUpdateBranchPricesDto,
    @CurrentUser('id') actorId: string,
  ): Promise<BranchPriceItem[]> {
    return this.commandBus.execute(new BulkUpdateBranchPricesCommand(dto, actorId));
  }
}
