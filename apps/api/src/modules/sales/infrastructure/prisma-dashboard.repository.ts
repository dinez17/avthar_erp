import { Injectable } from '@nestjs/common';
import { isOverdue } from '@tiles-erp/shared';
import type { Prisma } from '@prisma/client';
import type { DailySales, DashboardSummary, TopProductRow } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { DashboardRepository, DashboardWindow } from '../domain/dashboard.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const startOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date: Date): Date => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

const dayKey = (date: Date): string => startOfDay(date).toISOString();

/**
 * Fills in the days nobody sold anything, so the trend has an even x-axis instead of
 * silently skipping quiet days.
 */
const fillDays = (from: Date, to: Date, byDay: Map<string, DailySales>): DailySales[] => {
  const days: DailySales[] = [];
  const cursor = startOfDay(from);
  const last = startOfDay(to);

  while (cursor <= last) {
    const key = cursor.toISOString();
    days.push(byDay.get(key) ?? { date: key, invoiceCount: 0, salesValue: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(window: DashboardWindow): Promise<DashboardSummary> {
    const from = startOfDay(window.from);
    const to = endOfDay(window.to);
    const todayFrom = startOfDay(new Date());
    const todayTo = endOfDay(new Date());
    const branch = window.branchId ? { branchId: window.branchId } : {};

    const postedInvoice: Prisma.SalesInvoiceWhereInput = {
      deletedAt: null,
      status: 'POSTED',
      ...branch,
    };
    const postedReceipt: Prisma.CustomerReceiptWhereInput = {
      deletedAt: null,
      status: 'POSTED',
      ...branch,
    };

    const [
      periodInvoices,
      todayInvoices,
      periodReceipts,
      todayReceipts,
      periodPurchases,
      openInvoices,
      pendingOrders,
      balances,
      products,
      lines,
    ] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: { ...postedInvoice, invoiceDate: { gte: from, lte: to } },
        select: { invoiceDate: true, grandTotal: true, gstAmount: true },
      }),
      this.prisma.salesInvoice.aggregate({
        where: { ...postedInvoice, invoiceDate: { gte: todayFrom, lte: todayTo } },
        _sum: { grandTotal: true },
        _count: true,
      }),
      this.prisma.customerReceipt.aggregate({
        where: { ...postedReceipt, receiptDate: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.customerReceipt.aggregate({
        where: { ...postedReceipt, receiptDate: { gte: todayFrom, lte: todayTo } },
        _sum: { amount: true },
      }),
      this.prisma.purchaseInvoice.aggregate({
        where: {
          deletedAt: null,
          status: 'POSTED',
          ...branch,
          invoiceDate: { gte: from, lte: to },
        },
        _sum: { grandTotal: true },
      }),
      // Outstanding is a live figure, not a windowed one: every unpaid invoice counts.
      this.prisma.salesInvoice.findMany({
        where: postedInvoice,
        select: { invoiceDate: true, dueDate: true, grandTotal: true, paidAmount: true },
      }),
      this.prisma.salesOrder.findMany({
        where: {
          deletedAt: null,
          status: { in: ['CONFIRMED', 'PARTIALLY_INVOICED'] },
          ...branch,
        },
        select: { grandTotal: true },
      }),
      this.prisma.stockBalance.findMany({
        where: { qtyBoxes: { gt: 0 }, ...branch },
        select: { productId: true, qtyBoxes: true },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null },
        select: { id: true, landingCost: true, reorderLevelBoxes: true },
      }),
      this.prisma.salesInvoiceLine.findMany({
        where: { salesInvoice: { ...postedInvoice, invoiceDate: { gte: from, lte: to } } },
        select: {
          productId: true,
          qtyBoxes: true,
          lineTotal: true,
          product: {
            select: { sku: true, name: true, piecesPerBox: true, baseUom: true },
          },
        },
      }),
    ]);

    // --- sales trend ---
    const byDay = new Map<string, DailySales>();
    for (const invoice of periodInvoices) {
      const key = dayKey(invoice.invoiceDate);
      const entry = byDay.get(key) ?? { date: key, invoiceCount: 0, salesValue: 0 };
      entry.invoiceCount += 1;
      entry.salesValue = round2(entry.salesValue + Number(invoice.grandTotal));
      byDay.set(key, entry);
    }

    // --- outstanding, split by the same rule the ageing report uses ---
    let outstandingValue = 0;
    let overdueValue = 0;
    for (const invoice of openInvoices) {
      const balance = round2(Number(invoice.grandTotal) - Number(invoice.paidAmount));
      if (balance <= 0.005) continue;
      outstandingValue = round2(outstandingValue + balance);
      if (isOverdue(invoice.dueDate, invoice.invoiceDate)) {
        overdueValue = round2(overdueValue + balance);
      }
    }

    // --- stock at landing cost, and how many products sit below their reorder level ---
    const productById = new Map(products.map((product) => [product.id, product]));
    const onHandByProduct = new Map<string, number>();
    let stockValue = 0;
    for (const balance of balances) {
      const qty = Number(balance.qtyBoxes);
      onHandByProduct.set(balance.productId, (onHandByProduct.get(balance.productId) ?? 0) + qty);
      const landingCost = Number(productById.get(balance.productId)?.landingCost ?? 0);
      stockValue = round2(stockValue + qty * landingCost);
    }

    let lowStockCount = 0;
    for (const product of products) {
      const reorderLevel = Number(product.reorderLevelBoxes ?? 0);
      if (reorderLevel <= 0) continue;
      if ((onHandByProduct.get(product.id) ?? 0) < reorderLevel) lowStockCount += 1;
    }

    // --- what sold most, by value ---
    const byProduct = new Map<string, TopProductRow>();
    for (const line of lines) {
      const row = byProduct.get(line.productId) ?? {
        productId: line.productId,
        sku: line.product.sku,
        productName: line.product.name,
        qtyBoxes: 0,
        piecesPerBox: line.product.piecesPerBox,
        baseUom: line.product.baseUom,
        salesValue: 0,
      };
      row.qtyBoxes = round3(row.qtyBoxes + Number(line.qtyBoxes));
      row.salesValue = round2(row.salesValue + Number(line.lineTotal));
      byProduct.set(line.productId, row);
    }

    const periodSalesValue = round2(
      periodInvoices.reduce((sum, invoice) => sum + Number(invoice.grandTotal), 0),
    );

    return {
      fromDate: from.toISOString(),
      toDate: to.toISOString(),

      todaySalesValue: round2(Number(todayInvoices._sum.grandTotal ?? 0)),
      todayInvoiceCount: todayInvoices._count,
      todayCollectedValue: round2(Number(todayReceipts._sum.amount ?? 0)),

      periodSalesValue,
      periodInvoiceCount: periodInvoices.length,
      periodCollectedValue: round2(Number(periodReceipts._sum.amount ?? 0)),
      periodGstValue: round2(
        periodInvoices.reduce((sum, invoice) => sum + Number(invoice.gstAmount), 0),
      ),
      periodPurchaseValue: round2(Number(periodPurchases._sum.grandTotal ?? 0)),

      outstandingValue,
      overdueValue,

      pendingOrderCount: pendingOrders.length,
      pendingOrderValue: round2(
        pendingOrders.reduce((sum, order) => sum + Number(order.grandTotal), 0),
      ),

      stockValue,
      lowStockCount,

      dailySales: fillDays(from, to, byDay),
      topProducts: [...byProduct.values()]
        .sort((a, b) => b.salesValue - a.salesValue)
        .slice(0, 8),
    };
  }
}
