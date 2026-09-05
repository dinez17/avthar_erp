import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type { GoodsReceiptItem, Paginated } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  GetGoodsReceiptQuery,
  ListGoodsReceiptsQuery,
  PostGoodsReceiptCommand,
} from '../application/goods-receipt.handlers';
import { CreateGoodsReceiptDto, GoodsReceiptListQueryDto } from './dto/goods-receipt.dto';

@ApiTags('Goods receipts')
@ApiBearerAuth()
@Controller('goods-receipts')
export class GoodsReceiptController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.GRN_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List goods receipts, newest first' })
  list(@Query() query: GoodsReceiptListQueryDto): Promise<Paginated<GoodsReceiptItem>> {
    return this.queryBus.execute(
      new ListGoodsReceiptsQuery(query, {
        supplierId: query.supplierId,
        branchId: query.branchId,
        orderId: query.orderId,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
        uninvoiced: query.uninvoiced,
      }),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.GRN_READ)
  @ApiOperation({ summary: 'Get a goods receipt with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GoodsReceiptItem> {
    return this.queryBus.execute(new GetGoodsReceiptQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.GRN_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({
    summary: 'Post a goods receipt; stock is received into the godown and the order updated',
  })
  create(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser('id') actorId: string,
  ): Promise<GoodsReceiptItem> {
    return this.commandBus.execute(new PostGoodsReceiptCommand(dto, actorId));
  }
}
