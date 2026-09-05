import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildPaginated,
  ConflictError,
  isInterStateSupply,
  NotFoundError,
  ValidationError,
} from '@tiles-erp/shared';
import type {
  AvailableStockItem,
  BranchAllocationRow,
  OrderSplitPlan,
  Paginated,
  PaginationQuery,
  SalesOrderItem,
  SalesOrderLineItem,
  StockReservationItem,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { queryAvailableStock } from './available-stock.query';
import type {
  CustomerCredit,
  PlannedReservation,
  SalesOrderFilter,
  SalesOrderRepository,
  SalesOrderWriteData,
} from '../domain/sales-order.repository';

const include = {
  branch: { select: { name: true } },
  quotation: { select: { quotationNumber: true } },
  lines: {
    include: {
      product: {
        select: { sku: true, name: true, sizeMm: true, piecesPerBox: true, baseUom: true },
      },
      reservations: { select: { qtyBoxes: true, status: true, branchId: true } },
    },
  },
} satisfies Prisma.SalesOrderInclude;

type Row = Prisma.SalesOrderGetPayload<{ include: typeof include }>;

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const toLine = (line: Row['lines'][number]): SalesOrderLineItem => {
  const qtyBoxes = Number(line.qtyBoxes);
  const invoicedQtyBoxes = Number(line.invoicedQtyBoxes);
  return {
    id: line.id,
    productId: line.productId,
    sku: line.product.sku,
    productName: line.product.name,
    sizeMm: line.product.sizeMm,
    piecesPerBox: line.product.piecesPerBox,
    baseUom: line.product.baseUom,
    boxes: line.boxes,
    pieces: line.pieces,
    qtyBoxes,
    mrp: line.mrp === null ? null : Number(line.mrp),
    rate: Number(line.rate),
    discountPct: Number(line.discountPct),
    gstRate: Number(line.gstRate),
    lineSubTotal: Number(line.lineSubTotal),
    lineGst: Number(line.lineGst),
    lineTotal: Number(line.lineTotal),
    invoicedQtyBoxes,
    pendingQtyBoxes: round3(qtyBoxes - invoicedQtyBoxes),
    reservedQtyBoxes: round3(
      line.reservations
        .filter((reservation) => reservation.status === 'ACTIVE')
        .reduce((sum, reservation) => sum + Number(reservation.qtyBoxes), 0),
    ),
  };
};

/**
 * The branches supplying an order, home first.
 *
 * Read off the live reservations rather than stored, because a release or a cancel can
 * change it and a stored copy would go stale without anyone noticing.
 */
const supplyingBranchIdsOf = (row: Row): string[] => {
  const seen = new Set<string>();
  for (const line of row.lines) {
    for (const reservation of line.reservations) {
      if (reservation.status === 'ACTIVE') seen.add(reservation.branchId);
    }
  }
  const ids = [...seen];
  return [
    ...ids.filter((id) => id === row.branchId),
    ...ids.filter((id) => id !== row.branchId),
  ];
};

const toItem = (row: Row, withLines: boolean): SalesOrderItem => {
  const supplyingBranchIds = supplyingBranchIdsOf(row);
  return {
  id: row.id,
  orderNumber: row.orderNumber,
  quotationId: row.quotationId,
  quotationNumber: row.quotation?.quotationNumber ?? null,
  customerId: row.customerId,
  customerName: row.customerName,
  customerAddress: row.customerAddress,
  customerMobile: row.customerMobile,
  salesmanUserId: row.salesmanUserId,
  salesmanName: row.salesmanName,
  branchId: row.branchId,
  branchName: row.branch.name,
  orderDate: row.orderDate.toISOString(),
  deliveryDate: row.deliveryDate ? row.deliveryDate.toISOString() : null,
  status: row.status,
  allowCrossBranch: row.allowCrossBranch,
  isSplit: supplyingBranchIds.length > 1,
  supplyingBranchIds,
  subTotal: Number(row.subTotal),
  gstAmount: Number(row.gstAmount),
  freightCharge: Number(row.freightCharge),
  unloadingCharge: Number(row.unloadingCharge),
  loadingCharge: Number(row.loadingCharge),
  roundOff: Number(row.roundOff),
  grandTotal: Number(row.grandTotal),
  remarks: row.remarks,
  cancelReason: row.cancelReason,
  lineCount: row.lines.length,
  totalBoxes: round2(row.lines.reduce((sum, line) => sum + Number(line.qtyBoxes), 0)),
  version: row.version,
  ...(withLines ? { lines: row.lines.map(toLine) } : {}),
  };
};

@Injectable()
export class PrismaSalesOrderRepository implements SalesOrderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  async nextOrderNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'SALES_ORDER', branchId ?? null);
  }

  async list(query: PaginationQuery, filter: SalesOrderFilter): Promise<Paginated<SalesOrderItem>> {
    const where: Prisma.SalesOrderWhereInput = {
      deletedAt: null,
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { customerMobile: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include,
        orderBy: { orderDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<SalesOrderItem | null> {
    const row = await this.prisma.salesOrder.findFirst({ where: { id, deletedAt: null }, include });
    return row ? toItem(row, true) : null;
  }

  async create(
    number: string,
    data: SalesOrderWriteData,
    createdBy: UUID,
  ): Promise<SalesOrderItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.salesOrder.create({
        data: {
          orderNumber: number,
          quotationId: data.quotationId,
          customerId: data.customerId,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          customerMobile: data.customerMobile,
          salesmanUserId: data.salesmanUserId,
          salesmanName: data.salesmanName,
          branchId: data.branchId,
          orderDate: data.orderDate,
          deliveryDate: data.deliveryDate,
          remarks: data.remarks,
          allowCrossBranch: data.allowCrossBranch,
          subTotal: data.subTotal,
          gstAmount: data.gstAmount,
          freightCharge: data.freightCharge,
          unloadingCharge: data.unloadingCharge,
          loadingCharge: data.loadingCharge,
          roundOff: data.roundOff,
          grandTotal: data.grandTotal,
          createdBy,
          lines: { create: data.lines },
        },
        include,
      });
      // The quotation is spent once an order exists for it.
      if (data.quotationId) {
        // A walk-in quote gains the customer it was finally ordered for.
        await tx.quotation.updateMany({
          where: { id: data.quotationId, customerId: null },
          data: { customerId: data.customerId },
        });
        await tx.quotation.update({
          where: { id: data.quotationId },
          data: { status: 'CONVERTED', updatedBy: createdBy, version: { increment: 1 } },
        });
      }
      return created;
    });
    return toItem(row, true);
  }

  async update(
    id: UUID,
    version: number,
    data: SalesOrderWriteData,
    updatedBy: UUID,
  ): Promise<SalesOrderItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesOrder.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Sales order not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only draft orders can be edited');
      }
      const updated = await tx.salesOrder.updateMany({
        where: { id, version },
        data: {
          customerId: data.customerId,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          customerMobile: data.customerMobile,
          salesmanUserId: data.salesmanUserId,
          salesmanName: data.salesmanName,
          branchId: data.branchId,
          orderDate: data.orderDate,
          deliveryDate: data.deliveryDate,
          remarks: data.remarks,
          allowCrossBranch: data.allowCrossBranch,
          subTotal: data.subTotal,
          gstAmount: data.gstAmount,
          freightCharge: data.freightCharge,
          unloadingCharge: data.unloadingCharge,
          loadingCharge: data.loadingCharge,
          roundOff: data.roundOff,
          grandTotal: data.grandTotal,
          updatedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Sales order was modified by someone else. Reload and retry.');
      }
      await tx.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
      await tx.salesOrderLine.createMany({
        data: data.lines.map((line) => ({ ...line, salesOrderId: id })),
      });
      return tx.salesOrder.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async confirm(
    id: UUID,
    version: number,
    reservations: PlannedReservation[],
    confirmedBy: UUID,
    allowCrossBranch: boolean,
  ): Promise<SalesOrderItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesOrder.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Sales order not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError(`Only draft orders can be confirmed (this one is ${existing.status})`);
      }
      const updated = await tx.salesOrder.updateMany({
        where: { id, version },
        data: {
          status: 'CONFIRMED',
          allowCrossBranch,
          confirmedAt: new Date(),
          confirmedBy,
          updatedBy: confirmedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Sales order was modified by someone else. Reload and retry.');
      }
      await tx.stockReservation.createMany({
        data: reservations.map((reservation) => ({
          salesOrderId: id,
          salesOrderLineId: reservation.salesOrderLineId,
          productId: reservation.productId,
          // The reservation's own branch, not the order's: on a cross-branch order
          // they differ, and that difference is what splits the invoice.
          branchId: reservation.branchId,
          godownId: reservation.godownId,
          gateId: reservation.gateId,
          batchNo: reservation.batchNo,
          shade: reservation.shade,
          qtyBoxes: reservation.qtyBoxes,
          createdBy: confirmedBy,
        })),
      });
      return tx.salesOrder.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async cancel(
    id: UUID,
    version: number,
    reason: string,
    cancelledBy: UUID,
  ): Promise<SalesOrderItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesOrder.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Sales order not found');
      if (existing.status === 'CANCELLED') {
        throw new ValidationError('This order is already cancelled');
      }
      if (existing.status === 'INVOICED' || existing.status === 'PARTIALLY_INVOICED') {
        throw new ValidationError('Invoiced orders cannot be cancelled');
      }
      const updated = await tx.salesOrder.updateMany({
        where: { id, version },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy,
          cancelReason: reason,
          updatedBy: cancelledBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Sales order was modified by someone else. Reload and retry.');
      }
      // Releasing the hold frees the stock for other orders straight away.
      await tx.stockReservation.updateMany({
        where: { salesOrderId: id, status: 'ACTIVE' },
        data: { status: 'RELEASED', closedAt: new Date(), closedBy: cancelledBy },
      });
      return tx.salesOrder.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const existing = await this.prisma.salesOrder.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Sales order not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError('Only draft orders can be deleted; cancel confirmed orders instead');
    }
    await this.prisma.salesOrder.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy, version: { increment: 1 } },
    });
  }

  async credit(customerId: UUID): Promise<CustomerCredit> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        name: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        phone: true,
        isActive: true,
        creditLimit: true,
        creditDays: true,
      },
    });
    if (!customer) throw new ValidationError('Customer not found');

    const [committed, billed] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: {
          customerId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'PARTIALLY_INVOICED'] },
        },
        _sum: { grandTotal: true },
      }),
      // Posted invoices not yet settled. Committed orders and unpaid invoices are both
      // exposure and neither counts the other — an order becomes an invoice, and until it
      // does the order is what the customer owes against.
      this.prisma.salesInvoice.aggregate({
        where: { customerId, deletedAt: null, status: 'POSTED' },
        _sum: { grandTotal: true, paidAmount: true },
      }),
    ]);

    const outstanding = round2(
      Number(billed._sum.grandTotal ?? 0) - Number(billed._sum.paidAmount ?? 0),
    );

    return {
      name: customer.name,
      address:
        [customer.addressLine1, customer.addressLine2, customer.city].filter(Boolean).join(', ') ||
        null,
      mobile: customer.phone,
      isActive: customer.isActive,
      creditLimit: Number(customer.creditLimit),
      creditDays: customer.creditDays,
      committedValue: Number(committed._sum.grandTotal ?? 0),
      outstanding,
    };
  }

  async assertBranch(branchId: UUID): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new ValidationError('Branch not found');
  }

  async salesmanName(userId: UUID): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : null;
  }

  async isSalesman(userId: UUID): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        roles: { some: { role: { isSalesRole: true, deletedAt: null } } },
      },
      select: { id: true },
    });
    return found !== null;
  }

  availableStock(branchIds: UUID[], productIds: UUID[]): Promise<AvailableStockItem[]> {
    return queryAvailableStock(this.prisma, branchIds, productIds);
  }

  /**
   * Every branch a cross-branch order may draw from.
   *
   * Active branches only: an inactive one is usually being wound down, and reserving its
   * stock for someone else's order is the opposite of what that means.
   */
  async sellableBranchIds(): Promise<UUID[]> {
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    return branches.map((branch) => branch.id);
  }

  async reservations(salesOrderId: UUID): Promise<StockReservationItem[]> {
    const rows = await this.prisma.stockReservation.findMany({
      where: { salesOrderId },
      include: {
        product: { select: { sku: true, name: true, piecesPerBox: true, baseUom: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const [godowns, branches] = await Promise.all([
      this.prisma.godown.findMany({
        where: { id: { in: [...new Set(rows.map((row) => row.godownId))] } },
        select: { id: true, name: true },
      }),
      this.prisma.branch.findMany({
        where: { id: { in: [...new Set(rows.map((row) => row.branchId))] } },
        select: { id: true, name: true },
      }),
    ]);
    const nameByGodown = new Map(godowns.map((godown) => [godown.id, godown.name]));
    const nameByBranch = new Map(branches.map((branch) => [branch.id, branch.name]));

    return rows.map((row) => ({
      id: row.id,
      salesOrderLineId: row.salesOrderLineId,
      productId: row.productId,
      sku: row.product.sku,
      productName: row.product.name,
      piecesPerBox: row.product.piecesPerBox,
      baseUom: row.product.baseUom,
      branchId: row.branchId,
      branchName: nameByBranch.get(row.branchId) ?? '',
      godownId: row.godownId,
      godownName: nameByGodown.get(row.godownId) ?? 'Unknown godown',
      batchNo: row.batchNo,
      shade: row.shade,
      qtyBoxes: Number(row.qtyBoxes),
      status: row.status,
    }));
  }

  /**
   * How a confirmed order breaks down by supplying branch.
   *
   * One row per branch holding stock against the order, home branch first. Each row is
   * one invoice: the value is what that branch supplies, and the tax treatment is
   * decided by that branch's state against the customer's — which is why a single order
   * can carry CGST+SGST on one invoice and IGST on another.
   */
  async splitPlan(salesOrderId: UUID): Promise<OrderSplitPlan> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: salesOrderId, deletedAt: null },
      include: {
        ...include,
        customer: { select: { stateCode: true } },
        invoices: {
          where: { deletedAt: null, status: { not: 'CANCELLED' } },
          select: { id: true, invoiceNumber: true, branchId: true },
        },
      },
    });
    if (!order) throw new NotFoundError('Sales order not found');

    const reservations = await this.prisma.stockReservation.findMany({
      where: { salesOrderId, status: 'ACTIVE' },
      select: { branchId: true, salesOrderLineId: true, qtyBoxes: true },
    });

    const rateByLine = new Map(
      order.lines.map((line) => [
        line.id,
        // Value per box after discount, so a part-supplied line values correctly.
        Number(line.qtyBoxes) > 0 ? Number(line.lineSubTotal) / Number(line.qtyBoxes) : 0,
      ]),
    );

    const branchIds = [...new Set(reservations.map((r) => r.branchId))];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds.length > 0 ? branchIds : [order.branchId] } },
      select: { id: true, name: true, stateCode: true },
    });
    const branchById = new Map(branches.map((branch) => [branch.id, branch]));
    const invoiceByBranch = new Map(order.invoices.map((invoice) => [invoice.branchId, invoice]));

    const rows: BranchAllocationRow[] = [];
    for (const branchId of branchIds) {
      const mine = reservations.filter((r) => r.branchId === branchId);
      const branch = branchById.get(branchId);
      const invoice = invoiceByBranch.get(branchId);
      rows.push({
        branchId,
        branchName: branch?.name ?? '',
        isHomeBranch: branchId === order.branchId,
        lineCount: new Set(mine.map((r) => r.salesOrderLineId)).size,
        qtyBoxes: round3(mine.reduce((sum, r) => sum + Number(r.qtyBoxes), 0)),
        subTotal: round2(
          mine.reduce(
            (sum, r) => sum + Number(r.qtyBoxes) * (rateByLine.get(r.salesOrderLineId) ?? 0),
            0,
          ),
        ),
        interState: isInterStateSupply(branch?.stateCode, order.customer.stateCode),
        invoiceId: invoice?.id ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
      });
    }

    // Home branch first, then the rest by value — the biggest supplier is the one
    // anyone reading the plan cares about next.
    rows.sort((a, b) => {
      if (a.isHomeBranch !== b.isHomeBranch) return a.isHomeBranch ? -1 : 1;
      return b.subTotal - a.subTotal;
    });

    const orderedQty = round3(order.lines.reduce((sum, line) => sum + Number(line.qtyBoxes), 0));
    const invoicedQty = round3(
      order.lines.reduce((sum, line) => sum + Number(line.invoicedQtyBoxes), 0),
    );

    return {
      salesOrderId,
      orderNumber: order.orderNumber,
      homeBranchId: order.branchId,
      allowCrossBranch: order.allowCrossBranch,
      isSplit: rows.length > 1,
      rows,
      invoicedQtyBoxes: invoicedQty,
      pendingQtyBoxes: round3(Math.max(orderedQty - invoicedQty, 0)),
    };
  }

}
