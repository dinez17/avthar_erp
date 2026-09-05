import { Injectable } from '@nestjs/common';
import type { Prisma, PurchaseOrder } from '@prisma/client';
import { buildPaginated } from '@tiles-erp/shared';
import type {
  Paginated,
  PaginationQuery,
  PoAckStatus,
  SupplierPortalBranch,
  SupplierPortalInvoice,
  SupplierPortalOrder,
  SupplierPortalOrderDetail,
  SupplierPortalPayment,
  SupplierPortalPoStockLine,
  SupplierPortalProduct,
  SupplierPortalSummary,
  UUID,
} from '@tiles-erp/shared-types';

/** Purchase-order statuses that still owe stock — i.e. count towards "PO stock". */
const OPEN_PO_STATUSES = ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'] as const;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { SupplierPortalRepository } from '../domain/supplier-portal.repository';

type OrderRow = PurchaseOrder & {
  branch: { name: string };
  _count: { lines: number };
};

const toOrder = (row: OrderRow): SupplierPortalOrder => ({
  id: row.id,
  poNumber: row.poNumber,
  orderDate: row.orderDate.toISOString(),
  expectedDate: row.expectedDate ? row.expectedDate.toISOString() : null,
  branchName: row.branch.name,
  status: row.status,
  ackStatus: row.supplierAckStatus as PoAckStatus,
  ackAt: row.supplierAckAt ? row.supplierAckAt.toISOString() : null,
  ackNote: row.supplierAckNote,
  lineCount: row._count.lines,
  grandTotal: Number(row.grandTotal),
});

@Injectable()
export class PrismaSupplierPortalRepository implements SupplierPortalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(supplierId: UUID): Promise<SupplierPortalSummary> {
    const [supplier, ordersToAcknowledge, openOrders, postedInvoices] = await Promise.all([
      this.prisma.supplier.findFirstOrThrow({
        where: { id: supplierId },
        select: { name: true },
      }),
      this.prisma.purchaseOrder.count({
        where: { supplierId, deletedAt: null, status: 'APPROVED', supplierAckStatus: 'PENDING' },
      }),
      this.prisma.purchaseOrder.count({
        where: { supplierId, deletedAt: null, status: { in: ['APPROVED', 'PARTIALLY_RECEIVED'] } },
      }),
      this.prisma.purchaseInvoice.findMany({
        where: { supplierId, deletedAt: null, status: 'POSTED' },
        select: { grandTotal: true, paidAmount: true },
      }),
    ]);

    let unpaidInvoices = 0;
    let outstanding = 0;
    for (const inv of postedInvoices) {
      const due = Number(inv.grandTotal) - Number(inv.paidAmount);
      if (due > 0.005) {
        unpaidInvoices += 1;
        outstanding += due;
      }
    }

    return {
      supplierId,
      supplierName: supplier.name,
      ordersToAcknowledge,
      openOrders,
      unpaidInvoices,
      outstanding: Math.round(outstanding * 100) / 100,
    };
  }

  async orders(supplierId: UUID, query: PaginationQuery): Promise<Paginated<SupplierPortalOrder>> {
    // Suppliers never see internal drafts.
    const where: Prisma.PurchaseOrderWhereInput = {
      supplierId,
      deletedAt: null,
      status: { not: 'DRAFT' },
      ...(query.search ? { poNumber: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { branch: { select: { name: true } }, _count: { select: { lines: true } } },
        orderBy: { orderDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return buildPaginated(rows.map(toOrder), query.page, query.pageSize, total);
  }

  async orderDetail(supplierId: UUID, orderId: UUID): Promise<SupplierPortalOrderDetail | null> {
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id: orderId, supplierId, deletedAt: null, status: { not: 'DRAFT' } },
      include: {
        branch: { select: { name: true } },
        _count: { select: { lines: true } },
        lines: { include: { product: { select: { name: true, sku: true } } } },
      },
    });
    if (!row) return null;
    return {
      ...toOrder(row),
      remarks: row.remarks,
      lines: row.lines.map((line) => ({
        productName: line.product.name,
        sku: line.product.sku,
        qtyBoxes: Number(line.qtyBoxes),
        rate: Number(line.rate),
        lineTotal: Number(line.lineTotal),
      })),
    };
  }

  async invoices(
    supplierId: UUID,
    query: PaginationQuery,
  ): Promise<Paginated<SupplierPortalInvoice>> {
    const where: Prisma.PurchaseInvoiceWhereInput = {
      supplierId,
      deletedAt: null,
      status: 'POSTED',
      ...(query.search ? { invoiceNumber: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({
        where,
        include: { branch: { select: { name: true } } },
        orderBy: { invoiceDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return buildPaginated(
      rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate.toISOString(),
        branchName: row.branch.name,
        status: row.status,
        grandTotal: Number(row.grandTotal),
      })),
      query.page,
      query.pageSize,
      total,
    );
  }

  async payments(
    supplierId: UUID,
    query: PaginationQuery,
  ): Promise<Paginated<SupplierPortalPayment>> {
    const where: Prisma.SupplierPaymentWhereInput = {
      supplierId,
      deletedAt: null,
      status: 'POSTED',
      ...(query.search ? { paymentNumber: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);
    return buildPaginated(
      rows.map((row) => ({
        id: row.id,
        paymentNumber: row.paymentNumber,
        paymentDate: row.paymentDate.toISOString(),
        mode: row.mode,
        amount: Number(row.amount),
      })),
      query.page,
      query.pageSize,
      total,
    );
  }

  async products(supplierId: UUID): Promise<SupplierPortalProduct[]> {
    // The supplier's catalogue is every product under a brand assigned to this supplier.
    // The product's own purchase rate prefills the raise-PO form.
    const catalogue = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true, brand: { supplierId, deletedAt: null } },
      select: {
        id: true,
        sku: true,
        name: true,
        sizeMm: true,
        gstRate: true,
        purchaseRate: true,
      },
    });
    const byProduct = new Map<string, (typeof catalogue)[number]>();
    for (const product of catalogue) byProduct.set(product.id, product);
    const productIds = [...byProduct.keys()];
    if (productIds.length === 0) return [];

    const [stock, poLines] = await Promise.all([
      this.prisma.stockBalance.groupBy({
        by: ['productId'],
        where: { productId: { in: productIds } },
        _sum: { qtyBoxes: true },
      }),
      this.prisma.purchaseOrderLine.findMany({
        where: {
          productId: { in: productIds },
          order: { supplierId, deletedAt: null, status: { in: [...OPEN_PO_STATUSES] } },
        },
        select: { productId: true, qtyBoxes: true, receivedBoxes: true, orderId: true },
      }),
    ]);

    const stockMap = new Map(stock.map((s) => [s.productId, Number(s._sum.qtyBoxes ?? 0)]));
    const poAgg = new Map<string, { pending: number; orders: Set<string> }>();
    for (const line of poLines) {
      const pending = Number(line.qtyBoxes) - Number(line.receivedBoxes);
      if (pending <= 0.0005) continue;
      const agg = poAgg.get(line.productId) ?? { pending: 0, orders: new Set<string>() };
      agg.pending += pending;
      agg.orders.add(line.orderId);
      poAgg.set(line.productId, agg);
    }

    return productIds
      .map((productId): SupplierPortalProduct => {
        const product = byProduct.get(productId)!;
        const agg = poAgg.get(productId);
        return {
          productId,
          sku: product.sku,
          name: product.name,
          sizeMm: product.sizeMm,
          gstRate: Number(product.gstRate),
          defaultRate: product.purchaseRate === null ? null : Number(product.purchaseRate),
          currentStock: round3(stockMap.get(productId) ?? 0),
          poStock: round3(agg?.pending ?? 0),
          poCount: agg?.orders.size ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async productPoStock(supplierId: UUID, productId: UUID): Promise<SupplierPortalPoStockLine[]> {
    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: {
        productId,
        order: { supplierId, deletedAt: null, status: { in: [...OPEN_PO_STATUSES] } },
      },
      select: {
        qtyBoxes: true,
        receivedBoxes: true,
        order: {
          select: {
            id: true,
            poNumber: true,
            expectedDate: true,
            status: true,
            supplierAckStatus: true,
          },
        },
      },
      orderBy: { order: { orderDate: 'desc' } },
    });
    return lines
      .map((line): SupplierPortalPoStockLine => ({
        poId: line.order.id,
        poNumber: line.order.poNumber,
        orderedBoxes: Number(line.qtyBoxes),
        pendingBoxes: round3(Number(line.qtyBoxes) - Number(line.receivedBoxes)),
        expectedDate: line.order.expectedDate ? line.order.expectedDate.toISOString() : null,
        status: line.order.status,
        ackStatus: line.order.supplierAckStatus as PoAckStatus,
      }))
      .filter((line) => line.pendingBoxes > 0.0005);
  }

  async branches(): Promise<SupplierPortalBranch[]> {
    const rows = await this.prisma.branch.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return rows;
  }

  async acknowledgeOrder(
    supplierId: UUID,
    orderId: UUID,
    decision: 'ACKNOWLEDGED' | 'QUERIED',
    note: string | null,
    actorId: UUID,
  ): Promise<SupplierPortalOrder | 'NOT_FOUND' | 'NOT_ALLOWED'> {
    const existing = await this.prisma.purchaseOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { supplierId: true, status: true, supplierAckStatus: true },
    });
    if (!existing || existing.supplierId !== supplierId) return 'NOT_FOUND';
    // Only a placed order awaiting a response can be answered.
    if (existing.status !== 'APPROVED' || existing.supplierAckStatus !== 'PENDING') {
      return 'NOT_ALLOWED';
    }

    await this.prisma.purchaseOrder.update({
      where: { id: orderId },
      data: {
        supplierAckStatus: decision,
        supplierAckAt: new Date(),
        supplierAckNote: note,
        updatedBy: actorId,
      },
    });

    const row = await this.prisma.purchaseOrder.findFirstOrThrow({
      where: { id: orderId },
      include: { branch: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    return toOrder(row);
  }
}
