import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  Paginated,
  PaginationQuery,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  OrderWriteData,
  PurchaseOrderFilter,
  PurchaseOrderRepository,
} from '../domain/purchase-order.repository';

const include = {
  supplier: { select: { name: true } },
  branch: { select: { name: true } },
  lines: {
    include: {
      product: { select: { sku: true, name: true, piecesPerBox: true, baseUom: true } },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

type Row = Prisma.PurchaseOrderGetPayload<{ include: typeof include }>;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const toItem = (row: Row, withLines: boolean): PurchaseOrderItem => ({
  id: row.id,
  poNumber: row.poNumber,
  supplierId: row.supplierId,
  supplierName: row.supplier.name,
  branchId: row.branchId,
  branchName: row.branch.name,
  orderDate: row.orderDate.toISOString(),
  expectedDate: row.expectedDate ? row.expectedDate.toISOString() : null,
  status: row.status,
  subTotal: Number(row.subTotal),
  gstAmount: Number(row.gstAmount),
  grandTotal: Number(row.grandTotal),
  remarks: row.remarks,
  lineCount: row.lines.length,
  version: row.version,
  ...(withLines
    ? {
        lines: row.lines.map((line) => {
          const qtyBoxes = Number(line.qtyBoxes);
          const receivedBoxes = Number(line.receivedBoxes);
          return {
            id: line.id,
            productId: line.productId,
            sku: line.product.sku,
            productName: line.product.name,
            piecesPerBox: line.product.piecesPerBox,
            baseUom: line.product.baseUom,
            qtyBoxes,
            rate: Number(line.rate),
            discountPct: Number(line.discountPct),
            gstRate: Number(line.gstRate),
            lineSubTotal: Number(line.lineSubTotal),
            lineGst: Number(line.lineGst),
            lineTotal: Number(line.lineTotal),
            receivedBoxes,
            pendingBoxes: round3(qtyBoxes - receivedBoxes),
          };
        }),
      }
    : {}),
});

@Injectable()
export class PrismaPurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  async nextPoNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'PURCHASE_ORDER', branchId ?? null);
  }

  async assertReferences(supplierId: UUID, branchId: UUID): Promise<void> {
    const [supplier, branch] = await Promise.all([
      this.prisma.supplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: { id: true, isActive: true },
      }),
      this.prisma.branch.findFirst({
        where: { id: branchId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!supplier) throw new ValidationError('Supplier not found');
    if (!supplier.isActive) throw new ValidationError('Supplier is inactive');
    if (!branch) throw new ValidationError('Branch not found');
  }

  async productGstRates(productIds: UUID[]): Promise<Map<UUID, { gstRate: number; sku: string }>> {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, sku: true, gstRate: true },
    });
    return new Map(rows.map((r) => [r.id, { gstRate: Number(r.gstRate), sku: r.sku }]));
  }

  async list(
    query: PaginationQuery,
    filter: PurchaseOrderFilter,
  ): Promise<Paginated<PurchaseOrderItem>> {
    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            orderDate: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { poNumber: { contains: query.search, mode: 'insensitive' } },
              { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include,
        orderBy: { orderDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<PurchaseOrderItem | null> {
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    return row ? toItem(row, true) : null;
  }

  async create(
    poNumber: string,
    data: OrderWriteData,
    createdBy: UUID,
  ): Promise<PurchaseOrderItem> {
    const row = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: data.supplierId,
        branchId: data.branchId,
        orderDate: data.orderDate,
        expectedDate: data.expectedDate,
        remarks: data.remarks,
        subTotal: data.subTotal,
        gstAmount: data.gstAmount,
        grandTotal: data.grandTotal,
        createdBy,
        lines: { create: data.lines },
      },
      include,
    });
    return toItem(row, true);
  }

  async update(
    id: UUID,
    version: number,
    data: OrderWriteData,
    updatedBy: UUID,
  ): Promise<PurchaseOrderItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Purchase order not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only draft orders can be edited');
      }
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, version },
        data: {
          supplierId: data.supplierId,
          branchId: data.branchId,
          orderDate: data.orderDate,
          expectedDate: data.expectedDate,
          remarks: data.remarks,
          subTotal: data.subTotal,
          gstAmount: data.gstAmount,
          grandTotal: data.grandTotal,
          updatedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Purchase order was modified by someone else. Reload and retry.');
      }
      await tx.purchaseOrderLine.deleteMany({ where: { orderId: id } });
      await tx.purchaseOrderLine.createMany({
        data: data.lines.map((line) => ({ ...line, orderId: id })),
      });
      return tx.purchaseOrder.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async setStatus(
    id: UUID,
    version: number,
    status: PurchaseOrderStatus,
    actorId: UUID,
  ): Promise<PurchaseOrderItem> {
    const updated = await this.prisma.purchaseOrder.updateMany({
      where: { id, deletedAt: null, version },
      data: {
        status,
        updatedBy: actorId,
        version: { increment: 1 },
        ...(status === 'APPROVED' ? { approvedAt: new Date(), approvedBy: actorId } : {}),
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Purchase order not found');
      throw new ConflictError('Purchase order was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.purchaseOrder.findFirstOrThrow({ where: { id }, include });
    return toItem(row, true);
  }
}
