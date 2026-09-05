import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { STOCK_REPOSITORY } from './domain/stock.repository';
import { TRANSFER_REPOSITORY } from './domain/transfer.repository';
import { STOCK_REPORTS_REPOSITORY } from './domain/reports.repository';
import { PrismaStockRepository } from './infrastructure/prisma-stock.repository';
import { PrismaTransferRepository } from './infrastructure/prisma-transfer.repository';
import { PrismaStockReportsRepository } from './infrastructure/prisma-reports.repository';
import { StockController } from './presentation/stock.controller';
import { TransferController } from './presentation/transfer.controller';
import { StockReportsController } from './presentation/reports.controller';
import {
  BulkSetStockHandler,
  ListCountSheetHandler,
  ListStockBalancesHandler,
  ListStockMovementsHandler,
  PostAdjustmentHandler,
  PostOpeningStockHandler,
} from './application/stock.handlers';
import {
  CancelTransferHandler,
  CreateTransferHandler,
  GetTransferHandler,
  GetTransferPrintHandler,
  ListTransfersHandler,
  ReceiveTransferHandler,
} from './application/transfer.handlers';
import {
  LowStockHandler,
  StockAgeingHandler,
  StockValuationHandler,
} from './application/reports.handlers';

/**
 * Inventory: append-only stock ledger with a balance projection. Stock is only ever
 * changed by posting movements; later modules (purchase, sales, dispatch) post through
 * this same engine.
 */
@Module({
  imports: [CqrsModule],
  controllers: [StockController, TransferController, StockReportsController],
  providers: [
    { provide: STOCK_REPOSITORY, useClass: PrismaStockRepository },
    { provide: TRANSFER_REPOSITORY, useClass: PrismaTransferRepository },
    { provide: STOCK_REPORTS_REPOSITORY, useClass: PrismaStockReportsRepository },
    ListCountSheetHandler,
  ListStockBalancesHandler,
    ListStockMovementsHandler,
    PostOpeningStockHandler,
    PostAdjustmentHandler,
    BulkSetStockHandler,
    ListTransfersHandler,
    GetTransferHandler,
    GetTransferPrintHandler,
    CreateTransferHandler,
    ReceiveTransferHandler,
    CancelTransferHandler,
    StockValuationHandler,
    StockAgeingHandler,
    LowStockHandler,
  ],
  exports: [STOCK_REPOSITORY],
})
export class InventoryModule {}
