import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  Paginated,
  PaginationQuery,
  PurchaseInvoiceItem,
  SupplierRateItem,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  InvoiceFilter,
  InvoiceWriteData,
  PurchaseInvoiceRepository,
} from '../domain/purchase-invoice.repository';

const include = {
  supplier: { select: { name: true } },
  branch: { select: { name: true } },
  receipt: { select: { grnNumber: true } },
  lines: {
    include: {
      product: { select: { sku: true, name: true, piecesPerBox: true, baseUom: true } },
    },
  },
} satisfies Prisma.PurchaseInvoiceInclude;

type Row = Prisma.PurchaseInvoiceGetPayload<{ include: typeof include }>;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const toItem = (row: Row, withLines: boolean): PurchaseInvoiceItem => ({
  id: row.id,
  invoiceNumber: row.invoiceNumber,
  supplierInvoiceNo: row.supplierInvoiceNo,
  supplierId: row.supplierId,
  supplierName: row.supplier.name,
  branchId: row.branchId,
  branchName: row.branch.name,
  receiptId: row.receiptId,
  grnNumber: row.receipt?.grnNumber ?? null,
  invoiceDate: row.invoiceDate.toISOString(),
  dueDate: row.dueDate ? row.dueDate.toISOString() : null,
  status: row.status,
  transportCharge: Number(row.transportCharge),
  additionalCharge: Number(row.additionalCharge),
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
          const subTotal = Number(line.lineSubTotal);
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
            lineSubTotal: subTotal,
            lineGst: Number(line.lineGst),
            lineTotal: Number(line.lineTotal),
            impliedLandingCost: qtyBoxes > 0 ? round2(Number(line.lineTotal) / qtyBoxes) : 0,
          };
        }),
      }
    : {}),
});

@Injectable()
export class PrismaPurchaseInvoiceRepository implements PurchaseInvoiceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  async nextInvoiceNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'PURCHASE_INVOICE', branchId ?? null);
  }

  async invoiceForReceipt(receiptId: UUID, excludeId?: UUID): Promise<string | null> {
    const existing = await this.prisma.purchaseInvoice.findFirst({
      where: {
        receiptId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { invoiceNumber: true },
    });
    return existing?.invoiceNumber ?? null;
  }

  async supplierInvoiceExists(
    supplierId: UUID,
    supplierInvoiceNo: string,
    excludeId?: UUID,
  ): Promise<boolean> {
    const row = await this.prisma.purchaseInvoice.findFirst({
      where: {
        supplierId,
        supplierInvoiceNo: { equals: supplierInvoiceNo, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  async supplierTermDays(supplierId: UUID): Promise<number> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
      select: { paymentTermDays: true },
    });
    if (!supplier) throw new ValidationError('Supplier not found');
    return supplier.paymentTermDays;
  }

  async create(data: InvoiceWriteData): Promise<PurchaseInvoiceItem> {
    const row = await this.prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: data.invoiceNumber,
        supplierInvoiceNo: data.supplierInvoiceNo,
        supplierId: data.supplierId,
        branchId: data.branchId,
        receiptId: data.receiptId,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        transportCharge: data.transportCharge,
        additionalCharge: data.additionalCharge,
        subTotal: data.subTotal,
        gstAmount: data.gstAmount,
        grandTotal: data.grandTotal,
        remarks: data.remarks,
        createdBy: data.createdBy,
        lines: {
          create: data.lines.map((line) => ({
            productId: line.productId,
            qtyBoxes: line.qtyBoxes,
            rate: line.rate,
            discountPct: line.discountPct,
            gstRate: line.gstRate,
            lineSubTotal: line.lineSubTotal,
            lineGst: line.lineGst,
            lineTotal: line.lineTotal,
          })),
        },
      },
      include,
    });
    return toItem(row, true);
  }

  async update(
    id: UUID,
    version: number,
    data: InvoiceWriteData,
    updatedBy: UUID,
  ): Promise<PurchaseInvoiceItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseInvoice.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Purchase invoice not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only draft invoices can be edited');
      }

      const updated = await tx.purchaseInvoice.updateMany({
        where: { id, version },
        data: {
          supplierInvoiceNo: data.supplierInvoiceNo,
          supplierId: data.supplierId,
          branchId: data.branchId,
          receiptId: data.receiptId,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          transportCharge: data.transportCharge,
          additionalCharge: data.additionalCharge,
          subTotal: data.subTotal,
          gstAmount: data.gstAmount,
          grandTotal: data.grandTotal,
          remarks: data.remarks,
          updatedBy,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Invoice was modified by someone else. Reload and retry.');
      }

      await tx.purchaseInvoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.purchaseInvoiceLine.createMany({
        data: data.lines.map((line) => ({
          invoiceId: id,
          productId: line.productId,
          qtyBoxes: line.qtyBoxes,
          rate: line.rate,
          discountPct: line.discountPct,
          gstRate: line.gstRate,
          lineSubTotal: line.lineSubTotal,
          lineGst: line.lineGst,
          lineTotal: line.lineTotal,
        })),
      });

      return tx.purchaseInvoice.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  /**
   * Posting is where an invoice changes the master data: each line's implied landing
   * cost is written to rate history and copied onto the product, so future valuation
   * and pricing use what the goods actually cost.
   */
  async post(id: UUID, version: number, actorId: UUID): Promise<PurchaseInvoiceItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findFirst({
        where: { id, deletedAt: null },
        include,
      });
      if (!invoice) throw new NotFoundError('Purchase invoice not found');
      if (invoice.status === 'POSTED') throw new ValidationError('Invoice is already posted');
      if (invoice.status === 'CANCELLED') throw new ValidationError('Invoice is cancelled');

      const updated = await tx.purchaseInvoice.updateMany({
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
        throw new ConflictError('Invoice was modified by someone else. Reload and retry.');
      }

      const charges =
        Number(invoice.transportCharge) + Number(invoice.additionalCharge);
      const lineValues = invoice.lines.map((line) => Number(line.lineSubTotal));
      const totalValue = lineValues.reduce((sum, value) => sum + value, 0);

      for (const [index, line] of invoice.lines.entries()) {
        const qtyBoxes = Number(line.qtyBoxes);
        if (qtyBoxes <= 0) continue;

        // Charges are shared out in proportion to line value.
        const share =
          totalValue > 0 && charges > 0 ? (lineValues[index]! / totalValue) * charges : 0;
        const landingCost = round2((Number(line.lineTotal) + share) / qtyBoxes);
        const netRate = round2(Number(line.lineSubTotal) / qtyBoxes);

        await tx.supplierProductRate.create({
          data: {
            supplierId: invoice.supplierId,
            productId: line.productId,
            rate: netRate,
            landingCost,
            effectiveOn: invoice.invoiceDate,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            createdBy: actorId,
          },
        });

        await tx.product.update({
          where: { id: line.productId },
          data: { purchaseRate: netRate, landingCost, updatedBy: actorId },
        });
      }

      return tx.purchaseInvoice.findFirstOrThrow({ where: { id }, include });
    });

    return toItem(row, true);
  }

  async list(
    query: PaginationQuery,
    filter: InvoiceFilter,
  ): Promise<Paginated<PurchaseInvoiceItem>> {
    const where: Prisma.PurchaseInvoiceWhereInput = {
      deletedAt: null,
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            invoiceDate: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
              { supplierInvoiceNo: { contains: query.search, mode: 'insensitive' } },
              { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({
        where,
        include,
        orderBy: { invoiceDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<PurchaseInvoiceItem | null> {
    const row = await this.prisma.purchaseInvoice.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    return row ? toItem(row, true) : null;
  }

  async rateHistory(
    query: PaginationQuery,
    filter: { productId?: UUID; supplierId?: UUID },
  ): Promise<Paginated<SupplierRateItem>> {
    const where: Prisma.SupplierProductRateWhereInput = {
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplierProductRate.findMany({
        where,
        include: {
          supplier: { select: { name: true } },
          product: { select: { sku: true, name: true } },
        },
        orderBy: { effectiveOn: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supplierProductRate.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => ({
        id: row.id,
        supplierId: row.supplierId,
        supplierName: row.supplier.name,
        productId: row.productId,
        sku: row.product.sku,
        productName: row.product.name,
        rate: Number(row.rate),
        landingCost: Number(row.landingCost),
        effectiveOn: row.effectiveOn.toISOString(),
        invoiceNumber: row.invoiceNumber,
      })),
      query.page,
      query.pageSize,
      total,
    );
  }
}
