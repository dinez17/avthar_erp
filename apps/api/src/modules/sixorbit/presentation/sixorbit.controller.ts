import { SixOrbitInventoryService } from '../application/sixorbit-inventory.service';
import { SixOrbitInventoryExcelService } from '../application/sixorbit-inventory-excel.service';
import { InventoryPreviewDto } from './dto/inventory-preview.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type {
  Paginated,
  SixOrbitImportResult,
  SixOrbitImportStatus,
  SixOrbitImportStatusView,
  SixOrbitConfigItem,
  SixOrbitConnectionTest,
  SixOrbitPruneResult,
  SixOrbitSyncHealth,
  SixOrbitSyncLogItem,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import { PushProductDto } from './dto/push-product.dto';
import {
  GetSixOrbitConfigQuery,
  GetSixOrbitSyncHealthQuery,
  ListSixOrbitSyncLogQuery,
  PruneSixOrbitSyncLogCommand,
  SaveSixOrbitConfigCommand,
  TestSixOrbitConnectionCommand,
} from '../application/sixorbit.handlers';
import {
  DryRunSixOrbitImportQuery,
  GetSixOrbitImportStatusQuery,
  ResetSixOrbitImportStatusCommand,
  StartSixOrbitImportCommand,
} from '../application/sixorbit-import.handlers';
import {
  PushPendingProductsCommand,
  PushProductToSixOrbitCommand,
} from '../application/sixorbit-push.handlers';
import { PushCustomerToSixOrbitCommand } from '../application/sixorbit-customer-push.handlers';
import { PushSalesOrderToSixOrbitCommand } from '../application/sixorbit-sales-order-push.handlers';
import { SaveSixOrbitConfigDto } from './dto/save-sixorbit-config.dto';
import { StartSixOrbitImportDto } from './dto/start-sixorbit-import.dto';
import {
  PruneSixOrbitSyncLogDto,
  SixOrbitSyncHealthQueryDto,
} from './dto/prune-sixorbit-sync-log.dto';
import { SixOrbitSyncLogQueryDto } from './dto/sixorbit-sync-log-query.dto';

@ApiTags('SixOrbit')
@ApiBearerAuth()
@Controller('sixorbit')
export class SixOrbitController {
  constructor(
    private readonly inventory: SixOrbitInventoryService,
    private readonly inventoryExcel: SixOrbitInventoryExcelService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('inventory/excel/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } }))
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC, PERMISSIONS.STOCK_ADJUST)
  previewInventoryExcel(
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @CurrentUser('id') actorId: string,
  ) { return this.inventoryExcel.preview(file, actorId); }

  @Post('inventory/excel/:id/apply')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC, PERMISSIONS.STOCK_ADJUST)
  applyInventoryExcel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.inventoryExcel.apply(id, actorId);
  }

  @Post('inventory/preview')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC, PERMISSIONS.STOCK_ADJUST)
  previewInventory(@Body() dto: InventoryPreviewDto, @CurrentUser('id') actorId: string) {
    return this.inventory.preview(dto.startDate, dto.endDate, actorId);
  }

  @Get('inventory/:id')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC, PERMISSIONS.STOCK_READ)
  getInventoryRun(@Param('id', ParseUUIDPipe) id: string) { return this.inventory.get(id); }

  @Post('inventory/:id/apply')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC, PERMISSIONS.STOCK_ADJUST)
  applyInventory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.inventory.apply(id, actorId);
  }

  @Get('config')
  @RequirePermissions(PERMISSIONS.SIXORBIT_CONFIGURE)
  @ApiOperation({
    summary: 'Read the SixOrbit connection details',
    description:
      'The password is never returned — `hasPassword` reports only whether one has been stored.',
  })
  getConfig(): Promise<SixOrbitConfigItem | null> {
    return this.queryBus.execute(new GetSixOrbitConfigQuery());
  }

  @Put('config')
  @RequirePermissions(PERMISSIONS.SIXORBIT_CONFIGURE)
  @ApiOperation({
    summary: 'Save the SixOrbit connection details',
    description:
      'Omit `password` to leave the stored one untouched. Saving clears the cached session, so the next call logs in again.',
  })
  saveConfig(
    @Body() dto: SaveSixOrbitConfigDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SixOrbitConfigItem> {
    return this.commandBus.execute(new SaveSixOrbitConfigCommand(dto, actorId));
  }

  @Post('test-connection')
  @RequirePermissions(PERMISSIONS.SIXORBIT_CONFIGURE)
  @ApiOperation({
    summary: 'Log in to SixOrbit with the stored credentials and report the result',
    description:
      'Always returns 200. A refused login is an answer to the question, not a server error, and is reported in the `success` field.',
  })
  testConnection(): Promise<SixOrbitConnectionTest> {
    return this.commandBus.execute(new TestSixOrbitConnectionCommand());
  }

  @Get('sync-log')
  @RequirePermissions(PERMISSIONS.SIXORBIT_READ)
  @ApiOperation({ summary: 'List sync attempts, newest first' })
  listSyncLog(@Query() query: SixOrbitSyncLogQueryDto): Promise<Paginated<SixOrbitSyncLogItem>> {
    return this.queryBus.execute(new ListSixOrbitSyncLogQuery(query));
  }

  @Get('sync-log/health')
  @RequirePermissions(PERMISSIONS.SIXORBIT_READ)
  @ApiOperation({
    summary: 'How the integration has been faring',
    description:
      'Attempt counts are windowed; the "last succeeded" and "last failed" times are all-time, so an entity that has never worked reads differently from one that is simply quiet.',
  })
  syncHealth(@Query() query: SixOrbitSyncHealthQueryDto): Promise<SixOrbitSyncHealth> {
    return this.queryBus.execute(new GetSixOrbitSyncHealthQuery(query.windowHours));
  }

  @Delete('sync-log')
  @RequirePermissions(PERMISSIONS.SIXORBIT_CONFIGURE)
  @ApiOperation({
    summary: 'Delete sync attempts older than a given age',
    description:
      'Gated on `sixorbit:configure` rather than `sixorbit:read`: whoever watches the log is not necessarily whoever may destroy it.',
  })
  pruneSyncLog(@Query() dto: PruneSixOrbitSyncLogDto): Promise<SixOrbitPruneResult> {
    return this.commandBus.execute(new PruneSixOrbitSyncLogCommand(dto.olderThanDays));
  }

  @Post('products/import')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC)
  @ApiOperation({
    summary: "Import SixOrbit's product catalogue",
    description:
      'With `dryRun` the work is done inline and nothing is written. Without it the run is queued and reported through the status endpoint; a second run is refused while one is in flight.',
  })
  startImport(
    @Body() dto: StartSixOrbitImportDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('email') actorEmail: string,
  ): Promise<SixOrbitImportResult | SixOrbitImportStatus> {
    if (dto.dryRun) {
      return this.queryBus.execute(new DryRunSixOrbitImportQuery(dto.since ?? null));
    }
    return this.commandBus.execute(new StartSixOrbitImportCommand(dto, actorId, actorEmail));
  }

  @Get('products/import/status')
  @RequirePermissions(PERMISSIONS.SIXORBIT_READ)
  @ApiOperation({ summary: 'Progress and outcome of the current or last import' })
  importStatus(): Promise<SixOrbitImportStatusView> {
    return this.queryBus.execute(new GetSixOrbitImportStatusQuery());
  }

  @Delete('products/import/status')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC)
  @ApiOperation({
    summary: 'Clear a finished or stale import record',
    description: 'Clears the progress record only. Work already running in the worker continues.',
  })
  resetImportStatus(): Promise<void> {
    return this.commandBus.execute(new ResetSixOrbitImportStatusCommand());
  }

  @Post('products/:productId/push')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({
    summary: 'Queue one product to be written to SixOrbit',
    description:
      'Returns as soon as the job is queued. Watch the product row, or the sync console, for the outcome.',
  })
  async pushProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: PushProductDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.commandBus.execute(new PushProductToSixOrbitCommand(productId, actorId, dto.branchId));
  }

  @Post('products/push-pending')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC)
  @ApiOperation({
    summary: 'Queue every product that has never reached SixOrbit, or failed on the way',
    description:
      'Includes blocked products, since a master added on their side is what unblocks one. Bounded per call.',
  })
  pushPending(@CurrentUser('id') actorId: string): Promise<{ queued: number }> {
    return this.commandBus.execute(new PushPendingProductsCommand(actorId));
  }

  @Post('customers/:customerId/push')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC)
  @ApiOperation({ summary: 'Search, create or update one customer in SixOrbit' })
  pushCustomer(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.commandBus.execute(new PushCustomerToSixOrbitCommand(customerId));
  }

  @Post('sales-invoices/:salesInvoiceId/push')
  @RequirePermissions(PERMISSIONS.SIXORBIT_SYNC, PERMISSIONS.SALES_INVOICE_READ)
  @ApiOperation({ summary: 'Create a SixOrbit sales order from one posted ERP sales invoice' })
  pushSalesOrder(
    @Param('salesInvoiceId', ParseUUIDPipe) salesInvoiceId: string,
    @CurrentUser() user: import('@tiles-erp/shared-types').AuthenticatedUser,
  ) {
    return this.commandBus.execute(new PushSalesOrderToSixOrbitCommand(salesInvoiceId, user));
  }
}
