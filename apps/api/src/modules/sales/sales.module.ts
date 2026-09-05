import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AccountsModule } from '../accounts/accounts.module';
import { QUOTATION_REPOSITORY } from './domain/quotation.repository';
import { DASHBOARD_REPOSITORY } from './domain/dashboard.repository';
import { GST_REPOSITORY } from './domain/gst.repository';
import { PROFIT_REPOSITORY } from './domain/profit.repository';
import { RECEIPT_REPOSITORY } from './domain/receipt.repository';
import { SALES_INVOICE_REPOSITORY } from './domain/sales-invoice.repository';
import { SALES_ORDER_REPOSITORY } from './domain/sales-order.repository';
import { PrismaQuotationRepository } from './infrastructure/prisma-quotation.repository';
import { PrismaDashboardRepository } from './infrastructure/prisma-dashboard.repository';
import { PrismaGstRepository } from './infrastructure/prisma-gst.repository';
import { PrismaProfitRepository } from './infrastructure/prisma-profit.repository';
import { PrismaGstr1Repository } from './infrastructure/prisma-gstr1.repository';
import { PrismaReceiptRepository } from './infrastructure/prisma-receipt.repository';
import { PrismaSalesInvoiceRepository } from './infrastructure/prisma-sales-invoice.repository';
import { PrismaSalesOrderRepository } from './infrastructure/prisma-sales-order.repository';
import { QuotationController } from './presentation/quotation.controller';
import { DashboardController } from './presentation/dashboard.controller';
import { ProfitController } from './presentation/profit.controller';
import { ReceiptController } from './presentation/receipt.controller';
import { SalesInvoiceController } from './presentation/sales-invoice.controller';
import { SalesOrderController } from './presentation/sales-order.controller';
import {
  ChangeQuotationStatusHandler,
  CreateQuotationHandler,
  GetQuotationHandler,
  ListQuotationsHandler,
  ProductPriceHintsHandler,
  QuotationPrintHandler,
  QuotationStockHandler,
  UpdateQuotationHandler,
} from './application/quotation.handlers';
import {
  AvailableStockHandler,
  SellableBranchesHandler,
  CancelSalesOrderHandler,
  ConfirmSalesOrderHandler,
  ConvertQuotationHandler,
  CreateSalesOrderHandler,
  DeleteSalesOrderHandler,
  GetSalesOrderHandler,
  ListSalesOrdersHandler,
  SalesOrderReservationsHandler,
  UpdateSalesOrderHandler,
} from './application/sales-order.handlers';
import {
  CancelSalesInvoiceHandler,
  CreateSalesInvoiceHandler,
  DeleteSalesInvoiceHandler,
  GetSalesInvoiceHandler,
  InvoiceableLinesHandler,
  ListSalesInvoicesHandler,
  OrderSplitPlanHandler,
  PostSalesInvoiceHandler,
  SplitSalesOrderHandler,
  SalesInvoicePrintHandler,
  UpdateSalesInvoiceHandler,
} from './application/sales-invoice.handlers';
import {
  CancelReceiptHandler,
  CreateReceiptHandler,
  CustomerDueHandler,
  CustomerLedgerHandler,
  DeleteReceiptHandler,
  GetReceiptHandler,
  ListReceiptsHandler,
  OpenInvoicesHandler,
  OutstandingHandler,
  PostReceiptHandler,
  ReceiptPrintHandler,
  UpdateReceiptHandler,
} from './application/receipt.handlers';
import { DashboardSummaryHandler } from './application/dashboard.handlers';
import { Gstr1ReturnHandler, GstSummaryHandler } from './application/gst.handlers';

/** Sales: quotations, orders, tax invoices and the collections that settle them. */
@Module({
  // AccountsModule brings CashPostingService: posting a receipt or a payment writes
  // into the named account's book in the same transaction.
  imports: [CqrsModule, AccountsModule],
  controllers: [
    ProfitController,
    QuotationController,
    SalesOrderController,
    SalesInvoiceController,
    ReceiptController,
    DashboardController,
  ],
  providers: [
    { provide: QUOTATION_REPOSITORY, useClass: PrismaQuotationRepository },
    ListQuotationsHandler,
    GetQuotationHandler,
    ProductPriceHintsHandler,
    QuotationPrintHandler,
    QuotationStockHandler,
  QuotationStockHandler,
    CreateQuotationHandler,
    UpdateQuotationHandler,
    ChangeQuotationStatusHandler,
    { provide: SALES_ORDER_REPOSITORY, useClass: PrismaSalesOrderRepository },
    ListSalesOrdersHandler,
    GetSalesOrderHandler,
    SalesOrderReservationsHandler,
    AvailableStockHandler,
  SellableBranchesHandler,
    CreateSalesOrderHandler,
    ConvertQuotationHandler,
    UpdateSalesOrderHandler,
    ConfirmSalesOrderHandler,
    CancelSalesOrderHandler,
    DeleteSalesOrderHandler,
    { provide: SALES_INVOICE_REPOSITORY, useClass: PrismaSalesInvoiceRepository },
    ListSalesInvoicesHandler,
    GetSalesInvoiceHandler,
    InvoiceableLinesHandler,
    CreateSalesInvoiceHandler,
    UpdateSalesInvoiceHandler,
    OrderSplitPlanHandler,
  PostSalesInvoiceHandler,
  SplitSalesOrderHandler,
    SalesInvoicePrintHandler,
  SalesInvoicePrintHandler,
    CancelSalesInvoiceHandler,
    DeleteSalesInvoiceHandler,
    { provide: RECEIPT_REPOSITORY, useClass: PrismaReceiptRepository },
    ListReceiptsHandler,
    GetReceiptHandler,
    OpenInvoicesHandler,
    CustomerDueHandler,
  CustomerLedgerHandler,
    OutstandingHandler,
    CreateReceiptHandler,
    UpdateReceiptHandler,
    PostReceiptHandler,
    ReceiptPrintHandler,
  ReceiptPrintHandler,
    CancelReceiptHandler,
    DeleteReceiptHandler,
    { provide: DASHBOARD_REPOSITORY, useClass: PrismaDashboardRepository },
    DashboardSummaryHandler,
    { provide: GST_REPOSITORY, useClass: PrismaGstRepository },
    { provide: PROFIT_REPOSITORY, useClass: PrismaProfitRepository },
    GstSummaryHandler,
    Gstr1ReturnHandler,
    PrismaGstr1Repository,
  ],
  exports: [
    QUOTATION_REPOSITORY,
    SALES_ORDER_REPOSITORY,
    SALES_INVOICE_REPOSITORY,
    RECEIPT_REPOSITORY,
  ],
})
export class SalesModule {}
