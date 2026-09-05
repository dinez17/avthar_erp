import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ValidationError } from '@tiles-erp/shared';
import type {
  GoodsReceiptItem,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  GoodsReceiptRepository,
  ReceiptFilter,
  ReceiptWriteData,
} from '../domain/goods-receipt.repository';

const include = {
  supplier: { select: { name: true } },
  branch: { select: { name: true } },
  godown: { select: { name: true } },
  order: { select: { poNumber: true } },
  // Only the invoices that still stand: a cancelled or deleted one leaves the receipt
  // free to be billed again, which is the whole point of cancelling it.
  invoices: {
    where: { deletedAt: null, status: { not: 'CANCELLED' } },
    select: { invoiceNumber: true },
  },
  lines: {
    include: {
      product: { select: { sku: true, name: true, piecesPerBox: true, baseUom: true } },
    },
  },
} satisfies Prisma.GoodsReceiptInclude;

type Row = Prisma.GoodsReceiptGetPayload<{ include: typeof include }>;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const toItem = (row: Row, withLines: boolean): GoodsReceiptItem => ({
  id: row.id,
  grnNumber: row.grnNumber,
  orderId: row.orderId,
  poNumber: row.order?.poNumber ?? null,
  supplierId: row.supplierId,
  supplierName: row.supplier.name,
  branchId: row.branchId,
  branchName: row.branch.name,
  godownId: row.godownId,
  godownName: row.godown.name,
  receiptDate: row.receiptDate.toISOString(),
  supplierInvoiceNo: row.supplierInvoiceNo,
  remarks: row.remarks,
  lineCount: row.lines.length,
  totalBoxes: round3(row.lines.reduce((sum, l) => sum + Number(l.qtyBoxes), 0)),
  invoiced: row.invoices.length > 0,
  invoiceNumbers: row.invoices.map((invoice) => invoice.invoiceNumber),
  ...(withLines
    ? {
        lines: row.lines.map((line) => ({
          id: line.id,
          orderLineId: line.orderLineId,
          productId: line.productId,
          sku: line.product.sku,
          productName: line.product.name,
          batchNo: line.batchNo,
          shade: line.shade,
          qtyBoxes: Number(line.qtyBoxes),
          rate: Number(line.rate),
          piecesPerBox: line.product.piecesPerBox,
          baseUom: line.product.baseUom,
        })),
      }
    : {}),
});

@Injectable()
export class PrismaGoodsReceiptRepository implements GoodsReceiptRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  async nextGrnNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'GOODS_RECEIPT', branchId ?? null);
  }

  async assertEndpoints(supplierId: UUID, branchId: UUID, godownId: UUID): Promise<void> {
    const [supplier, godown] = await Promise.all([
      this.prisma.supplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: { id: true, isActive: true },
      }),
      this.prisma.godown.findFirst({
        where: { id: godownId, deletedAt: null },
        select: { id: true, branchId: true },
      }),
    ]);
    if (!supplier) throw new ValidationError('Supplier not found');
    if (!supplier.isActive) throw new ValidationError('Supplier is inactive');
    if (!godown) throw new ValidationError('Godown not found');
    if (godown.branchId !== branchId) {
      throw new ValidationError('Godown does not belong to the selected branch');
    }
  }

  /**
   * Posts the receipt: header + lines, stock IN movements with balance updates, order
   * line receipts, and the order status roll-up — all atomically.
   */
  async post(data: ReceiptWriteData): Promise<GoodsReceiptItem> {
    const created = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          grnNumber: data.grnNumber,
          orderId: data.orderId,
          supplierId: data.supplierId,
          branchId: data.branchId,
          godownId: data.godownId,
          receiptDate: data.receiptDate,
          supplierInvoiceNo: data.supplierInvoiceNo,
          remarks: data.remarks,
          createdBy: data.createdBy,
          lines: {
            create: data.lines.map((line) => ({
              orderLineId: line.orderLineId,
              productId: line.productId,
              batchNo: line.batchNo,
              shade: line.shade,
              qtyBoxes: line.qtyBoxes,
              rate: line.rate,
            })),
          },
        },
        include,
      });

      for (const line of data.lines) {
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            branchId: data.branchId,
            godownId: data.godownId,
            batchNo: line.batchNo,
            shade: line.shade,
            type: 'PURCHASE',
            direction: 'IN',
            qtyBoxes: line.qtyBoxes,
            refType: 'GRN',
            refId: receipt.id,
            refNumber: receipt.grnNumber,
            remarks: data.remarks,
            movementDate: data.receiptDate,
            createdBy: data.createdBy,
          },
        });

        const existing = await tx.stockBalance.findFirst({
          where: {
            productId: line.productId,
            branchId: data.branchId,
            godownId: data.godownId,
            gateId: null,
            batchNo: line.batchNo,
            shade: line.shade,
          },
          select: { id: true },
        });
        if (existing) {
          await tx.stockBalance.update({
            where: { id: existing.id },
            data: { qtyBoxes: { increment: line.qtyBoxes } },
          });
        } else {
          await tx.stockBalance.create({
            data: {
              productId: line.productId,
              branchId: data.branchId,
              godownId: data.godownId,
              gateId: null,
              batchNo: line.batchNo,
              shade: line.shade,
              qtyBoxes: line.qtyBoxes,
            },
          });
        }

        if (line.orderLineId) {
          await tx.purchaseOrderLine.update({
            where: { id: line.orderLineId },
            data: { receivedBoxes: { increment: line.qtyBoxes } },
          });
        }
      }

      if (data.orderId) {
        const orderLines = await tx.purchaseOrderLine.findMany({
          where: { orderId: data.orderId },
          select: { qtyBoxes: true, receivedBoxes: true },
        });
        const fullyReceived = orderLines.every(
          (line) => Number(line.receivedBoxes) >= Number(line.qtyBoxes),
        );
        const anyReceived = orderLines.some((line) => Number(line.receivedBoxes) > 0);
        await tx.purchaseOrder.update({
          where: { id: data.orderId },
          data: {
            status: fullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : 'APPROVED',
            version: { increment: 1 },
          },
        });
      }

      return receipt;
    });

    return toItem(created, true);
  }

  async list(
    query: PaginationQuery,
    filter: ReceiptFilter,
  ): Promise<Paginated<GoodsReceiptItem>> {
    const where: Prisma.GoodsReceiptWhereInput = {
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
      // A receipt already billed has nothing left to invoice, so the picker hides it.
      ...(filter.uninvoiced
        ? { invoices: { none: { deletedAt: null, status: { not: 'CANCELLED' } } } }
        : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            receiptDate: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { grnNumber: { contains: query.search, mode: 'insensitive' } },
              { supplierInvoiceNo: { contains: query.search, mode: 'insensitive' } },
              { order: { poNumber: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.goodsReceipt.findMany({
        where,
        include,
        orderBy: { receiptDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<GoodsReceiptItem | null> {
    const row = await this.prisma.goodsReceipt.findUnique({ where: { id }, include });
    return row ? toItem(row, true) : null;
  }
}
