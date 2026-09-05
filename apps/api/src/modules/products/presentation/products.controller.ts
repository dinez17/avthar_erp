import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type { AreaAudit, Paginated, ProductItem } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  AuditProductAreaQuery,
  BulkUpdateProductRatesCommand,
  FixProductAreaCommand,
  CreateProductCommand,
  DeleteProductCommand,
  GetProductQuery,
  ListProductSizesQuery,
  ListProductsQuery,
  UpdateProductCommand,
} from '../application/products.handlers';
import {
  BulkUpdateProductRatesDto,
  FixProductAreaDto,
  CreateProductDto,
  ProductListQueryDto,
  UpdateProductDto,
} from './dto/product.dto';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'List products (search across name/sku/barcode/hsn, filterable)' })
  list(@Query() query: ProductListQueryDto): Promise<Paginated<ProductItem>> {
    return this.queryBus.execute(
      new ListProductsQuery(query, {
        categoryId: query.categoryId,
        brandId: query.brandId,
        seriesId: query.seriesId,
        sizeMm: query.sizeMm,
      }),
    );
  }

  @Get('area-audit')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Products whose recorded sq.ft per box disagrees with their size' })
  auditArea(): Promise<AreaAudit> {
    return this.queryBus.execute(new AuditProductAreaQuery());
  }

  @Post('area-audit/fix')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Replace the recorded area with the figure the size implies' })
  fixArea(
    @Body() dto: FixProductAreaDto,
    @CurrentUser('id') actorId: string,
  ): Promise<{ fixed: number }> {
    return this.commandBus.execute(new FixProductAreaCommand(dto.productIds, actorId));
  }

  @Get('sizes')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Distinct product sizes, for filter dropdowns' })
  sizes(): Promise<string[]> {
    return this.queryBus.execute(new ListProductSizesQuery());
  }

  @Patch('rates/bulk')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({
    summary: 'Bulk-update purchase/transport/additional rates; landing cost is recomputed',
  })
  bulkUpdateRates(
    @Body() dto: BulkUpdateProductRatesDto,
    @CurrentUser('id') actorId: string,
  ): Promise<ProductItem[]> {
    return this.commandBus.execute(new BulkUpdateProductRatesCommand(dto, actorId));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Get a product by id' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductItem> {
    return this.queryBus.execute(new GetProductQuery(id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @ApiOperation({ summary: 'Create a product' })
  create(@Body() dto: CreateProductDto, @CurrentUser('id') actorId: string): Promise<ProductItem> {
    return this.commandBus.execute(new CreateProductCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Update a product (optimistic concurrency via version)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('id') actorId: string,
  ): Promise<ProductItem> {
    return this.commandBus.execute(new UpdateProductCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PRODUCT_DELETE)
  @ApiOperation({ summary: 'Soft-delete a product' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteProductCommand(id, actorId));
    return { success: true };
  }
}
