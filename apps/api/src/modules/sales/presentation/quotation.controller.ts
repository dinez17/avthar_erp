import {
  Body,
  Controller,
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
import type {
  AuthenticatedUser,
  AvailableStockItem,
  Paginated,
  ProductPriceHint,
  QuotationItem,
  QuotationPrintData,
} from '@tiles-erp/shared-types';
import type { PricingRights } from '../application/price-guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  ChangeQuotationStatusCommand,
  CreateQuotationCommand,
  GetQuotationQuery,
  ListQuotationsQuery,
  ProductPriceHintsQuery,
  QuotationPrintQuery,
  QuotationStockQuery,
  UpdateQuotationCommand,
} from '../application/quotation.handlers';
import {
  CreateQuotationDto,
  PriceHintsQueryDto,
  QuotationListQueryDto,
  QuotationStatusDto,
  UpdateQuotationDto,
} from './dto/quotation.dto';

/**
 * What this user may override while pricing.
 *
 * Two separate rights: a branch minimum can itself be set below cost, so permission to
 * ignore the minimum must not quietly include permission to lose money.
 */
const pricingRights = (user: AuthenticatedUser): PricingRights => ({
  canOverridePrice:
    user.roles.includes('SUPER_ADMIN') ||
    user.permissions.includes(PERMISSIONS.QUOTATION_OVERRIDE_PRICE),
  canSellBelowCost:
    user.roles.includes('SUPER_ADMIN') ||
    user.permissions.includes(PERMISSIONS.SELL_BELOW_COST),
  canOverrideCredit:
    user.roles.includes('SUPER_ADMIN') ||
    user.permissions.includes(PERMISSIONS.CUSTOMER_CREDIT_APPROVE),
});

@ApiTags('Quotations')
@ApiBearerAuth()
@Controller('quotations')
export class QuotationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List quotations, newest first' })
  list(@Query() query: QuotationListQueryDto): Promise<Paginated<QuotationItem>> {
    return this.queryBus.execute(
      new ListQuotationsQuery(query, {
        customerId: query.customerId,
        branchId: query.branchId,
        status: query.status,
      }),
    );
  }

  @Get('price-hints')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Branch pricing guidance for the given products' })
  priceHints(@Query() query: PriceHintsQueryDto): Promise<ProductPriceHint[]> {
    const ids = query.productIds.split(',').map((id) => id.trim()).filter(Boolean);
    return this.queryBus.execute(new ProductPriceHintsQuery(query.branchId, ids));
  }

  @Get('stock-availability')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Free stock for the quoted products: on hand less reservations' })
  stock(@Query() query: PriceHintsQueryDto): Promise<AvailableStockItem[]> {
    const ids = query.productIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.queryBus.execute(new QuotationStockQuery(query.branchId, ids));
  }

  @Get(':id/print')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Quotation with the letterhead and terms a printed copy needs' })
  print(@Param('id', ParseUUIDPipe) id: string): Promise<QuotationPrintData> {
    return this.queryBus.execute(new QuotationPrintQuery(id));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Get a quotation with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<QuotationItem> {
    return this.queryBus.execute(new GetQuotationQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.QUOTATION_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Create a draft quotation' })
  create(
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuotationItem> {
    return this.commandBus.execute(
      new CreateQuotationCommand(dto, user.id, pricingRights(user)),
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.QUOTATION_UPDATE)
  @ApiOperation({ summary: 'Update a draft quotation' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuotationItem> {
    return this.commandBus.execute(
      new UpdateQuotationCommand(id, dto, user.id, pricingRights(user)),
    );
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.QUOTATION_APPROVE)
  @ApiOperation({ summary: 'Send, accept or reject a quotation' })
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuotationStatusDto,
    @CurrentUser('id') actorId: string,
  ): Promise<QuotationItem> {
    return this.commandBus.execute(
      new ChangeQuotationStatusCommand(id, dto.version, dto.status, actorId),
    );
  }
}
