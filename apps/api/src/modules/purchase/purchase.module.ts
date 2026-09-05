import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AccountsModule } from '../accounts/accounts.module';
import { PURCHASE_ORDER_REPOSITORY } from './domain/purchase-order.repository';
import { GOODS_RECEIPT_REPOSITORY } from './domain/goods-receipt.repository';
import { PURCHASE_INVOICE_REPOSITORY } from './domain/purchase-invoice.repository';
import { PURCHASE_RETURN_REPOSITORY } from './domain/purchase-return.repository';
import { PrismaPurchaseOrderRepository } from './infrastructure/prisma-purchase-order.repository';
import { PrismaGoodsReceiptRepository } from './infrastructure/prisma-goods-receipt.repository';
import { PrismaPurchaseInvoiceRepository } from './infrastructure/prisma-purchase-invoice.repository';
import { PrismaPurchaseReturnRepository } from './infrastructure/prisma-purchase-return.repository';
import { PurchaseOrderController } from './presentation/purchase-order.controller';
import { GoodsReceiptController } from './presentation/goods-receipt.controller';
import { PurchaseInvoiceController } from './presentation/purchase-invoice.controller';
import { PurchaseReturnController } from './presentation/purchase-return.controller';
import {
  ApprovePurchaseOrderHandler,
  CancelPurchaseOrderHandler,
  CreatePurchaseOrderHandler,
  GetPurchaseOrderHandler,
  ListPurchaseOrdersHandler,
  UpdatePurchaseOrderHandler,
} from './application/purchase-order.handlers';
import {
  GetGoodsReceiptHandler,
  ListGoodsReceiptsHandler,
  PostGoodsReceiptHandler,
} from './application/goods-receipt.handlers';
import {
  CreatePurchaseInvoiceHandler,
  GetPurchaseInvoiceHandler,
  ListPurchaseInvoicesHandler,
  PostPurchaseInvoiceHandler,
  SupplierRateHistoryHandler,
  UpdatePurchaseInvoiceHandler,
} from './application/purchase-invoice.handlers';
import {
  CreatePurchaseReturnHandler,
  GetPurchaseReturnHandler,
  ListPurchaseReturnsHandler,
  PostPurchaseReturnHandler,
} from './application/purchase-return.handlers';
import { PURCHASE_GST_REPOSITORY } from './domain/purchase-gst.repository';
import { PrismaPurchaseGstRepository } from './infrastructure/prisma-purchase-gst.repository';
import { PurchaseGstController } from './presentation/purchase-gst.controller';
import {
  PurchaseGstSummaryHandler,
  TaxPositionHandler,
} from './application/purchase-gst.handlers';
import { SUPPLIER_PAYMENT_REPOSITORY } from './domain/supplier-payment.repository';
import { PrismaSupplierPaymentRepository } from './infrastructure/prisma-supplier-payment.repository';
import { SupplierPaymentController } from './presentation/supplier-payment.controller';
import {
  CancelSupplierPaymentHandler,
  CreateSupplierPaymentHandler,
  DeleteSupplierPaymentHandler,
  GetSupplierPaymentHandler,
  ListSupplierPaymentsHandler,
  OpenBillsHandler,
  OpenDebitNotesHandler,
  PayablesHandler,
  PostSupplierPaymentHandler,
  SupplierDueHandler,
  SupplierLedgerHandler,
  UpdateSupplierPaymentHandler,
} from './application/supplier-payment.handlers';

/** Purchase orders: drafting, approval and cancellation. Receipt arrives with the GRN module. */
@Module({
  // AccountsModule brings CashPostingService: posting a receipt or a payment writes
  // into the named account's book in the same transaction.
  imports: [CqrsModule, AccountsModule],
  controllers: [
    PurchaseOrderController,
    GoodsReceiptController,
    PurchaseInvoiceController,
    PurchaseReturnController,
    PurchaseGstController,
    SupplierPaymentController,
  ],
  providers: [
    { provide: PURCHASE_ORDER_REPOSITORY, useClass: PrismaPurchaseOrderRepository },
    { provide: GOODS_RECEIPT_REPOSITORY, useClass: PrismaGoodsReceiptRepository },
    { provide: PURCHASE_INVOICE_REPOSITORY, useClass: PrismaPurchaseInvoiceRepository },
    { provide: PURCHASE_RETURN_REPOSITORY, useClass: PrismaPurchaseReturnRepository },
    ListPurchaseOrdersHandler,
    GetPurchaseOrderHandler,
    CreatePurchaseOrderHandler,
    UpdatePurchaseOrderHandler,
    ApprovePurchaseOrderHandler,
    CancelPurchaseOrderHandler,
    ListGoodsReceiptsHandler,
    GetGoodsReceiptHandler,
    PostGoodsReceiptHandler,
    ListPurchaseInvoicesHandler,
    GetPurchaseInvoiceHandler,
    SupplierRateHistoryHandler,
    CreatePurchaseInvoiceHandler,
    UpdatePurchaseInvoiceHandler,
    PostPurchaseInvoiceHandler,
    ListPurchaseReturnsHandler,
    GetPurchaseReturnHandler,
    CreatePurchaseReturnHandler,
    PostPurchaseReturnHandler,
    { provide: PURCHASE_GST_REPOSITORY, useClass: PrismaPurchaseGstRepository },
    PurchaseGstSummaryHandler,
    TaxPositionHandler,
    { provide: SUPPLIER_PAYMENT_REPOSITORY, useClass: PrismaSupplierPaymentRepository },
    ListSupplierPaymentsHandler,
    GetSupplierPaymentHandler,
    OpenBillsHandler,
    OpenDebitNotesHandler,
    SupplierDueHandler,
    SupplierLedgerHandler,
    PayablesHandler,
    CreateSupplierPaymentHandler,
    UpdateSupplierPaymentHandler,
    PostSupplierPaymentHandler,
    CancelSupplierPaymentHandler,
    DeleteSupplierPaymentHandler,
  ],
  exports: [PURCHASE_ORDER_REPOSITORY],
})
export class PurchaseModule {}
