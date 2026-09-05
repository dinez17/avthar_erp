import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  Paginated,
  PaginationQuery,
  PurchaseReturnItem,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  PurchaseReturnRepository,
  ReturnFilter,
  ReturnWriteData,
} from '../domain/purchase-return.repository';

const include = {
  supplier: { select: { name: true } },
  branch: { select: { name: true } },
  godown: { select: { name: true } },
  receipt: { select: { grnNumber: true } },
  lines: {
    include: {
      product: { select: { sku: true, name: true, piecesPerBox: true, baseUom: true } },
    },
  },
} satisfies Prisma.PurchaseReturnInclude;

type Row = Prisma.PurchaseReturnGetPayload<{ include: typeof include }>;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const toItem = (row: Row, withLines: boolean): PurchaseReturnItem => ({
  id: row.id,
  returnNumber: row.returnNumber,
  supplierId: row.supplierId,
  supplierName: row.supplier.name,
  branchId: row.branchId,
  branchName: row.branch.name,
  godownId: row.godownId,
  godownName: row.godown.name,
  receiptId: row.receiptId,
  grnNumber: row.receipt?.grnNumber ?? null,
  returnDate: row.returnDate.toISOString(),
  reason: row.reason,
  remarks: row.remarks,
  status: row.status,
  subTotal: Number(row.subTotal),
  gstAmount: Number(row.gstAmount),
  grandTotal: Number(row.grandTotal),
  lineCount: row.lines.length,
  totalBoxes: round3(row.lines.reduce((sum, l) => sum + Number(l.qtyBoxes), 0)),
  version: row.version,
  ...(withLines
    ? {
        lines: row.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          sku: line.product.sku,
          productName: line.product.name,
          batchNo: line.batchNo,
          shade: line.shade,
          qtyBoxes: Number(line.qtyBoxes),
          rate: Number(line.rate),
          gstRate: Number(line.gstRate),
          lineSubTotal: Number(line.lineSubTotal),
          lineGst: Number(line.lineGst),
          lineTotal: Number(line.lineTotal),
          piecesPerBox: line.product.piecesPerBox,
          baseUom: line.product.baseUom,
        })),
      }
    : {}),
});

@Injectable()
export class PrismaPurchaseReturnRepository implements PurchaseReturnRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  async nextReturnNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'PURCHASE_RETURN', branchId ?? null);
  }

  async assertEndpoints(supplierId: UUID, branchId: UUID, godownId: UUID): Promise<void> {
    const [supplier, godown] = await Promise.all([
      this.prisma.supplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.godown.findFirst({
        where: { id: godownId, deletedAt: null },
        select: { id: true, branchId: true },
      }),
    ]);
    if (!supplier) throw new ValidationError('Supplier not found');
    if (!godown) throw new ValidationError('Godown not found');
    if (godown.branchId !== branchId) {
      throw new ValidationError('Godown does not belong to the selected branch');
    }
  }

  async create(data: ReturnWriteData): Promise<PurchaseReturnItem> {
    const row = await this.prisma.purchaseReturn.create({
      data: {
        returnNumber: data.returnNumber,
        supplierId: data.supplierId,
        branchId: data.branchId,
        godownId: data.godownId,
        receiptId: data.receiptId,
        returnDate: data.returnDate,
        reason: data.reason,
        remarks: data.remarks,
        subTotal: data.subTotal,
        gstAmount: data.gstAmount,
        grandTotal: data.grandTotal,
        createdBy: data.createdBy,
        lines: { create: data.lines },
      },
      include,
    });
    return toItem(row, true);
  }

  /**
   * Posting removes the goods from stock. Availability is re-checked inside the
   * transaction so a concurrent sale cannot leave the balance negative.
   */
  async post(id: UUID, version: number, actorId: UUID): Promise<PurchaseReturnItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const ret = await tx.purchaseReturn.findFirst({
        where: { id, deletedAt: null },
        include,
      });
      if (!ret) throw new NotFoundError('Purchase return not found');
      if (ret.status === 'POSTED') throw new ValidationError('Return is already posted');

      for (const line of ret.lines) {
        const balance = await tx.stockBalance.findFirst({
          where: {
            productId: line.productId,
            branchId: ret.branchId,
            godownId: ret.godownId,
            gateId: null,
            batchNo: line.batchNo,
            shade: line.shade,
          },
          select: { id: true, qtyBoxes: true },
        });
        const available = balance ? Number(balance.qtyBoxes) : 0;
        const qty = Number(line.qtyBoxes);
        if (available < qty) {
          throw new ValidationError(
            `${line.product.sku}: only ${available} boxes in stock, cannot return ${qty}`,
          );
        }

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            branchId: ret.branchId,
            godownId: ret.godownId,
            batchNo: line.batchNo,
            shade: line.shade,
            type: 'PURCHASE_RETURN',
            direction: 'OUT',
            qtyBoxes: qty,
            refType: 'PURCHASE_RETURN',
            refId: ret.id,
            refNumber: ret.returnNumber,
            reason: ret.reason,
            remarks: ret.remarks,
            movementDate: ret.returnDate,
            createdBy: actorId,
          },
        });

        await tx.stockBalance.update({
          where: { id: balance!.id },
          data: { qtyBoxes: { decrement: qty } },
        });
      }

      const updated = await tx.purchaseReturn.updateMany({
        where: { id, version },
        data: {
          status: 'POSTED',
          postedAt: new Date(),
          postedBy: actorId,
          updatedBy: actorId,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Return was modified by someone else. Reload and retry.');
      }

      return tx.purchaseReturn.findFirstOrThrow({ where: { id }, include });
    });

    return toItem(row, true);
  }

  async list(
    query: PaginationQuery,
    filter: ReturnFilter,
  ): Promise<Paginated<PurchaseReturnItem>> {
    const where: Prisma.PurchaseReturnWhereInput = {
      deletedAt: null,
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            returnDate: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { returnNumber: { contains: query.search, mode: 'insensitive' } },
              { reason: { contains: query.search, mode: 'insensitive' } },
              { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseReturn.findMany({
        where,
        include,
        orderBy: { returnDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchaseReturn.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<PurchaseReturnItem | null> {
    const row = await this.prisma.purchaseReturn.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    return row ? toItem(row, true) : null;
  }
}
