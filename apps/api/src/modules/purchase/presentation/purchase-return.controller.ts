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
import type { Paginated, PurchaseReturnItem } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  CreatePurchaseReturnCommand,
  GetPurchaseReturnQuery,
  ListPurchaseReturnsQuery,
  PostPurchaseReturnCommand,
} from '../application/purchase-return.handlers';
import {
  CreatePurchaseReturnDto,
  PostReturnDto,
  PurchaseReturnListQueryDto,
} from './dto/purchase-return.dto';

@ApiTags('Purchase returns')
@ApiBearerAuth()
@Controller('purchase-returns')
export class PurchaseReturnController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURN_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'List purchase returns, newest first' })
  list(@Query() query: PurchaseReturnListQueryDto): Promise<Paginated<PurchaseReturnItem>> {
    return this.queryBus.execute(
      new ListPurchaseReturnsQuery(query, {
        supplierId: query.supplierId,
        branchId: query.branchId,
        status: query.status,
      }),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURN_READ)
  @ApiOperation({ summary: 'Get a return with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseReturnItem> {
    return this.queryBus.execute(new GetPurchaseReturnQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURN_CREATE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Draft a purchase return' })
  create(
    @Body() dto: CreatePurchaseReturnDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseReturnItem> {
    return this.commandBus.execute(new CreatePurchaseReturnCommand(dto, actorId));
  }

  @Patch(':id/post')
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURN_POST)
  @ApiOperation({ summary: 'Post the return, removing the goods from stock' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostReturnDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PurchaseReturnItem> {
    return this.commandBus.execute(new PostPurchaseReturnCommand(id, dto.version, actorId));
  }
}
