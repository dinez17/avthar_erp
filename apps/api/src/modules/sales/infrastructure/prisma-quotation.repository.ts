import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  AvailableStockItem,
  Paginated,
  PaginationQuery,
  ProductPriceHint,
  QuotationItem,
  QuotationPrintData,
  QuotationStatus,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { queryAvailableStock } from './available-stock.query';
import { toLines, toPartyBlock } from './letterhead';
import type {
  QuotationFilter,
  QuotationRepository,
  QuotationWriteData,
} from '../domain/quotation.repository';

const include = {
  branch: { select: { name: true } },
  lines: {
    include: {
      product: {
        select: { sku: true, name: true, sizeMm: true, piecesPerBox: true, baseUom: true },
      },
    },
  },
} satisfies Prisma.QuotationInclude;

type Row = Prisma.QuotationGetPayload<{ include: typeof include }>;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const OPEN_STATUSES: QuotationStatus[] = ['DRAFT', 'SENT'];


const toItem = (row: Row, withLines: boolean): QuotationItem => ({
  id: row.id,
  quotationNumber: row.quotationNumber,
  customerId: row.customerId,
  customerName: row.customerName,
  customerAddress: row.customerAddress,
  customerMobile: row.customerMobile,
  salesmanUserId: row.salesmanUserId,
  salesmanName: row.salesmanName,
  branchId: row.branchId,
  branchName: row.branch.name,
  quotationDate: row.quotationDate.toISOString(),
  validUntil: row.validUntil ? row.validUntil.toISOString() : null,
  status: row.status,
  subTotal: Number(row.subTotal),
  gstAmount: Number(row.gstAmount),
  freightCharge: Number(row.freightCharge),
  unloadingCharge: Number(row.unloadingCharge),
  loadingCharge: Number(row.loadingCharge),
  roundOff: Number(row.roundOff),
  grandTotal: Number(row.grandTotal),
  remarks: row.remarks,
  lineCount: row.lines.length,
  totalBoxes: round2(row.lines.reduce((sum, l) => sum + Number(l.qtyBoxes), 0)),
  isExpired:
    row.validUntil !== null &&
    row.validUntil.getTime() < Date.now() &&
    OPEN_STATUSES.includes(row.status),
  version: row.version,
  ...(withLines
    ? {
        lines: row.lines.map((line) => {
          const rate = Number(line.rate);
          const discountPct = Number(line.discountPct);
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
            qtyBoxes: Number(line.qtyBoxes),
            mrp: line.mrp === null ? null : Number(line.mrp),
            rate,
            discountPct,
            gstRate: Number(line.gstRate),
            lineSubTotal: Number(line.lineSubTotal),
            lineGst: Number(line.lineGst),
            lineTotal: Number(line.lineTotal),
            netRate: round2(rate * (1 - discountPct / 100)),
          };
        }),
      }
    : {}),
});

@Injectable()
export class PrismaQuotationRepository implements QuotationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  async nextQuotationNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'QUOTATION', branchId ?? null);
  }

  async assertReferences(customerId: UUID | null, branchId: UUID): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw new ValidationError('Branch not found');

    // Walk-in quotes carry no customer master record.
    if (!customerId) return;
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!customer) throw new ValidationError('Customer not found');
    if (!customer.isActive) throw new ValidationError('Customer is inactive');
  }

  availableStock(branchId: UUID, productIds: UUID[]): Promise<AvailableStockItem[]> {
    return queryAvailableStock(this.prisma, [branchId], productIds);
  }

  async printData(id: UUID): Promise<QuotationPrintData | null> {
    const row = await this.prisma.quotation.findFirst({
      where: { id, deletedAt: null },
      include: { ...include, branch: { include: { company: true } } },
    });
    if (!row) return null;

    const setting = await this.prisma.setting.findUnique({ where: { key: 'quotation.terms' } });

    return {
      quotation: toItem(row as unknown as Row, true),
      company: toPartyBlock(row.branch.company),
      branch: toPartyBlock({ ...row.branch, legalName: null }),
      terms: toLines(setting?.value),
    };
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

  async customerSnapshot(
    customerId: UUID,
  ): Promise<{ name: string; address: string | null; mobile: string | null }> {
    const customer = await this.prisma.customer.findFirstOrThrow({
      where: { id: customerId, deletedAt: null },
      select: { name: true, addressLine1: true, addressLine2: true, city: true, phone: true },
    });
    const address = [customer.addressLine1, customer.addressLine2, customer.city]
      .filter(Boolean)
      .join(', ');
    return { name: customer.name, address: address || null, mobile: customer.phone };
  }

  /**
   * Gives a walk-in quotation a customer master record.
   *
   * The match is on the **last ten digits** of the phone, which is why the number is
   * normalised before it gets here: the same person quoted twice must land on the same
   * account, however the counter happened to punctuate it that day. Matching and creating
   * sit in one transaction, so two clerks accepting quotes for the same walk-in at the
   * same moment cannot create two records for them.
   */
  async registerWalkIn(
    id: UUID,
    details: { name: string; phone: string; address: string | null },
    actorId: UUID,
  ): Promise<{ customerId: UUID; customerCode: string; created: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({
        where: { deletedAt: null, phone: { endsWith: details.phone } },
        select: { id: true, code: true },
        orderBy: { createdAt: 'asc' },
      });

      if (existing) {
        await tx.quotation.update({
          where: { id },
          data: { customerId: existing.id, updatedBy: actorId },
        });
        return { customerId: existing.id, customerCode: existing.code, created: false };
      }

      const count = await tx.customer.count();
      const created = await tx.customer.create({
        data: {
          code: `CUST-${String(count + 1).padStart(6, '0')}`,
          name: details.name,
          phone: details.phone,
          addressLine1: details.address,
          // A walk-in buys over the counter, so no credit until somebody grants it.
          creditDays: 0,
          creditLimit: 0,
          notes: 'Created from an accepted quotation',
          createdBy: actorId,
        },
        select: { id: true, code: true },
      });

      await tx.quotation.update({
        where: { id },
        data: { customerId: created.id, updatedBy: actorId },
      });
      return { customerId: created.id, customerCode: created.code, created: true };
    });
  }

  async priceHints(branchId: UUID, productIds: UUID[]): Promise<Map<UUID, ProductPriceHint>> {
    if (productIds.length === 0) return new Map();
    const [products, prices] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
        select: {
          id: true,
          sku: true,
          name: true,
          sizeMm: true,
          piecesPerBox: true,
          baseUom: true,
          mrp: true,
          gstRate: true,
          landingCost: true,
        },
      }),
      this.prisma.productBranchPrice.findMany({
        where: { branchId, productId: { in: productIds } },
      }),
    ]);
    const priceByProduct = new Map(prices.map((p) => [p.productId, p]));

    return new Map(
      products.map((product) => {
        const price = priceByProduct.get(product.id);
        return [
          product.id,
          {
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            sizeMm: product.sizeMm,
            piecesPerBox: product.piecesPerBox,
            baseUom: product.baseUom,
            mrp: product.mrp === null ? null : Number(product.mrp),
            gstRate: Number(product.gstRate),
            landingCost: product.landingCost === null ? null : Number(product.landingCost),
            displayPrice: price ? Number(price.displayPrice) : null,
            minSellingPrice: price ? Number(price.minSellingPrice) : null,
            sellingPrice: price ? Number(price.sellingPrice) : null,
          },
        ];
      }),
    );
  }

  async list(
    query: PaginationQuery,
    filter: QuotationFilter,
  ): Promise<Paginated<QuotationItem>> {
    const where: Prisma.QuotationWhereInput = {
      deletedAt: null,
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            quotationDate: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { quotationNumber: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { customerMobile: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        include,
        orderBy: { quotationDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<QuotationItem | null> {
    const row = await this.prisma.quotation.findFirst({
      where: { id, deletedAt: null },
      include,
    });
    return row ? toItem(row, true) : null;
  }

  async create(
    number: string,
    data: QuotationWriteData,
    createdBy: UUID,
  ): Promise<QuotationItem> {
    const row = await this.prisma.quotation.create({
      data: {
        quotationNumber: number,
        customerId: data.customerId,
        customerName: data.customerName,
        customerAddress: data.customerAddress,
        customerMobile: data.customerMobile,
        salesmanUserId: data.salesmanUserId,
        salesmanName: data.salesmanName,
        branchId: data.branchId,
        quotationDate: data.quotationDate,
        validUntil: data.validUntil,
        remarks: data.remarks,
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
    return toItem(row, true);
  }

  async update(
    id: UUID,
    version: number,
    data: QuotationWriteData,
    updatedBy: UUID,
  ): Promise<QuotationItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.quotation.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Quotation not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only draft quotations can be edited');
      }
      const updated = await tx.quotation.updateMany({
        where: { id, version },
        data: {
          customerId: data.customerId,
          customerName: data.customerName,
          customerAddress: data.customerAddress,
          customerMobile: data.customerMobile,
          salesmanUserId: data.salesmanUserId,
          salesmanName: data.salesmanName,
          branchId: data.branchId,
          quotationDate: data.quotationDate,
          validUntil: data.validUntil,
          remarks: data.remarks,
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
        throw new ConflictError('Quotation was modified by someone else. Reload and retry.');
      }
      await tx.quotationLine.deleteMany({ where: { quotationId: id } });
      await tx.quotationLine.createMany({
        data: data.lines.map((line) => ({ ...line, quotationId: id })),
      });
      return tx.quotation.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async setStatus(
    id: UUID,
    version: number,
    status: QuotationStatus,
    actorId: UUID,
  ): Promise<QuotationItem> {
    const updated = await this.prisma.quotation.updateMany({
      where: { id, deletedAt: null, version },
      data: { status, updatedBy: actorId, version: { increment: 1 } },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.quotation.findFirst({ where: { id, deletedAt: null } });
      if (!exists) throw new NotFoundError('Quotation not found');
      throw new ConflictError('Quotation was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.quotation.findFirstOrThrow({ where: { id }, include });
    return toItem(row, true);
  }
}
