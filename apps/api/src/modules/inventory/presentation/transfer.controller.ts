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
import type {
  Paginated,
  StockTransferItem,
  TransferPrintData,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CancelTransferCommand,
  CreateTransferCommand,
  GetTransferPrintQuery,
  GetTransferQuery,
  ListTransfersQuery,
  ReceiveTransferCommand,
} from '../application/transfer.handlers';
import {
  CancelTransferDto,
  CreateTransferDto,
  ReceiveTransferDto,
  TransferListQueryDto,
} from './dto/transfer.dto';

@ApiTags('Stock transfers')
@ApiBearerAuth()
@Controller('stock/transfers')
export class TransferController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'List stock transfers, newest first' })
  list(@Query() query: TransferListQueryDto): Promise<Paginated<StockTransferItem>> {
    return this.queryBus.execute(
      new ListTransfersQuery(query, {
        branchId: query.branchId,
        status: query.status,
        fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
        toDate: query.toDate ? new Date(query.toDate) : undefined,
      }),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Get a transfer with its lines' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<StockTransferItem> {
    return this.queryBus.execute(new GetTransferQuery(id));
  }

  @Get(':id/print')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'The delivery challan or tax invoice, with its letterhead' })
  print(@Param('id', ParseUUIDPipe) id: string): Promise<TransferPrintData> {
    return this.queryBus.execute(new GetTransferPrintQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_TRANSFER)
  @ApiOperation({
    summary: 'Dispatch a transfer: stock leaves the source godown and the document is raised',
  })
  create(
    @Body() dto: CreateTransferDto,
    @CurrentUser('id') actorId: string,
  ): Promise<StockTransferItem> {
    return this.commandBus.execute(new CreateTransferCommand(dto, actorId));
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.STOCK_TRANSFER_RECEIVE)
  @ApiOperation({ summary: 'Book the goods in at the destination, noting anything short' })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveTransferDto,
    @CurrentUser('id') actorId: string,
  ): Promise<StockTransferItem> {
    return this.commandBus.execute(new ReceiveTransferCommand(id, dto, actorId));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.STOCK_TRANSFER_CANCEL)
  @ApiOperation({ summary: 'Turn a transfer back, returning the stock to the source godown' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTransferDto,
    @CurrentUser('id') actorId: string,
  ): Promise<StockTransferItem> {
    return this.commandBus.execute(new CancelTransferCommand(id, dto, actorId));
  }
}
