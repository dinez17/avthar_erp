import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginated, needsEwayBill, shortQty, ValidationError } from '@tiles-erp/shared';
import type {
  Paginated,
  PaginationQuery,
  StockTransferItem,
  TransferDocumentType,
  TransferPrintData,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { toPartyBlock } from '../../sales/infrastructure/letterhead';
import type { MovementPosting } from '../domain/stock.repository';
import type {
  CancelTransferRecord,
  ReceiveTransferRecord,
  TransferEndpointFacts,
  TransferListFilter,
  TransferRecord,
  TransferRepository,
} from '../domain/transfer.repository';

const include = {
  lines: {
    include: {
      product: {
        select: { sku: true, name: true, hsnCode: true, piecesPerBox: true, baseUom: true },
      },
    },
  },
  transporter: { select: { name: true } },
  vehicle: { select: { number: true } },
  driver: { select: { name: true, phone: true } },
} satisfies Prisma.StockTransferInclude;

type Row = Prisma.StockTransferGetPayload<{ include: typeof include }>;

const num = (value: Prisma.Decimal | number | null): number => (value === null ? 0 : Number(value));
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** The letterhead fields a branch contributes to a printed document. */
const branchLetterhead = {
  name: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  pincode: true,
  phone: true,
  email: true,
  gstin: true,
} satisfies Prisma.BranchSelect;

@Injectable()
export class PrismaTransferRepository implements TransferRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  private async names(ids: UUID[]): Promise<{
    branches: Map<string, string>;
    godowns: Map<string, string>;
  }> {
    const [branches, godowns] = await Promise.all([
      this.prisma.branch.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      this.prisma.godown.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ]);
    return {
      branches: new Map(branches.map((b) => [b.id, b.name])),
      godowns: new Map(godowns.map((g) => [g.id, g.name])),
    };
  }

  private async toItem(row: Row, withLines: boolean): Promise<StockTransferItem> {
    const { branches, godowns } = await this.names([
      row.fromBranchId,
      row.toBranchId,
      row.fromGodownId,
      row.toGodownId,
    ]);

    const totalBoxes = row.lines.reduce((sum, line) => sum + Number(line.qtyBoxes), 0);
    const totalShort = row.lines.reduce(
      (sum, line) =>
        line.qtyReceived === null
          ? sum
          : sum + shortQty(Number(line.qtyBoxes), Number(line.qtyReceived)),
      0,
    );
    const grandTotal = num(row.grandTotal);

    return {
      id: row.id,
      transferNo: row.transferNo,
      documentNo: row.documentNo,
      documentType: row.documentType,
      status: row.status,

      fromBranchId: row.fromBranchId,
      fromBranchName: branches.get(row.fromBranchId) ?? '',
      fromGodownId: row.fromGodownId,
      fromGodownName: godowns.get(row.fromGodownId) ?? '',
      toBranchId: row.toBranchId,
      toBranchName: branches.get(row.toBranchId) ?? '',
      toGodownId: row.toGodownId,
      toGodownName: godowns.get(row.toGodownId) ?? '',

      fromGstin: row.fromGstin,
      toGstin: row.toGstin,
      interState: row.interState,

      transferDate: row.transferDate.toISOString(),
      remarks: row.remarks,
      lineCount: row.lines.length,
      totalBoxes: round3(totalBoxes),
      interBranch: row.fromBranchId !== row.toBranchId,

      subTotal: num(row.subTotal),
      cgstAmount: num(row.cgstAmount),
      sgstAmount: num(row.sgstAmount),
      igstAmount: num(row.igstAmount),
      gstAmount: num(row.gstAmount),
      grandTotal,

      transporterId: row.transporterId,
      transporterName: row.transporter?.name ?? null,
      vehicleId: row.vehicleId,
      vehicleNumber: row.vehicle?.number ?? null,
      driverId: row.driverId,
      driverName: row.driver?.name ?? null,
      driverPhone: row.driver?.phone ?? null,
      lrNumber: row.lrNumber,
      freightCharge: num(row.freightCharge),

      distanceKm: row.distanceKm,
      ewayBillNo: row.ewayBillNo,
      ewayBillDate: row.ewayBillDate?.toISOString() ?? null,
      // Only worth flagging while it can still be acted on; a cancelled consignment
      // never went anywhere.
      ewayBillMissing:
        row.status !== 'CANCELLED' && needsEwayBill(grandTotal) && !row.ewayBillNo?.trim(),

      receivedAt: row.receivedAt?.toISOString() ?? null,
      receivedByName: row.receivedByName,
      receiptRemarks: row.receiptRemarks,
      totalShort: round3(totalShort),

      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,

      ...(withLines
        ? {
            lines: row.lines.map((line) => ({
              productId: line.productId,
              sku: line.product.sku,
              productName: line.product.name,
              hsnCode: line.product.hsnCode,
              batchNo: line.batchNo,
              shade: line.shade,
              qtyBoxes: Number(line.qtyBoxes),
              qtyReceived: line.qtyReceived === null ? null : Number(line.qtyReceived),
              qtyShort:
                line.qtyReceived === null
                  ? 0
                  : shortQty(Number(line.qtyBoxes), Number(line.qtyReceived)),
              piecesPerBox: line.product.piecesPerBox,
              baseUom: line.product.baseUom,
              rate: num(line.rate),
              gstRate: num(line.gstRate),
              lineSubTotal: num(line.lineSubTotal),
              lineGst: num(line.lineGst),
              lineTotal: num(line.lineTotal),
            })),
          }
        : {}),
    };
  }

  async nextTransferNo(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'STOCK_TRANSFER', branchId ?? null);
  }

  /**
   * The next number in the right series.
   *
   * The two series are counted separately, because a tax invoice raised on a transfer
   * has to sit in a continuous invoice series of its own — a gap in it is a question at
   * assessment time, and interleaving challans would guarantee gaps.
   */
  async nextDocumentNo(type: TransferDocumentType, branchId?: UUID): Promise<string> {
    return this.numbering.next(
      this.prisma,
      type === 'TAX_INVOICE' ? 'TRANSFER_INVOICE' : 'TRANSFER_CHALLAN',
      branchId ?? null,
    );
  }

  async assertEndpoints(record: {
    fromBranchId: UUID;
    fromGodownId: UUID;
    toBranchId: UUID;
    toGodownId: UUID;
  }): Promise<TransferEndpointFacts> {
    const [godowns, branches] = await Promise.all([
      this.prisma.godown.findMany({
        where: { id: { in: [record.fromGodownId, record.toGodownId] }, deletedAt: null },
        select: { id: true, branchId: true },
      }),
      this.prisma.branch.findMany({
        where: { id: { in: [record.fromBranchId, record.toBranchId] }, deletedAt: null },
        select: { id: true, gstin: true, stateCode: true },
      }),
    ]);

    const from = godowns.find((g) => g.id === record.fromGodownId);
    const to = godowns.find((g) => g.id === record.toGodownId);
    if (!from) throw new ValidationError('Source godown not found');
    if (!to) throw new ValidationError('Destination godown not found');
    if (from.branchId !== record.fromBranchId) {
      throw new ValidationError('Source godown does not belong to the source branch');
    }
    if (to.branchId !== record.toBranchId) {
      throw new ValidationError('Destination godown does not belong to the destination branch');
    }

    const fromBranch = branches.find((b) => b.id === record.fromBranchId);
    const toBranch = branches.find((b) => b.id === record.toBranchId);
    if (!fromBranch) throw new ValidationError('Source branch not found');
    if (!toBranch) throw new ValidationError('Destination branch not found');

    return {
      fromGstin: fromBranch.gstin,
      toGstin: toBranch.gstin,
      fromStateCode: fromBranch.stateCode,
      toStateCode: toBranch.stateCode,
    };
  }

  async assertCarrier(record: {
    transporterId: UUID | null;
    vehicleId: UUID | null;
    driverId: UUID | null;
  }): Promise<void> {
    if (record.transporterId) {
      const found = await this.prisma.transporter.count({
        where: { id: record.transporterId, deletedAt: null },
      });
      if (found === 0) throw new ValidationError('That transporter no longer exists');
    }
    if (record.vehicleId) {
      const found = await this.prisma.vehicle.count({
        where: { id: record.vehicleId, deletedAt: null },
      });
      if (found === 0) throw new ValidationError('That vehicle no longer exists');
    }
    if (record.driverId) {
      const found = await this.prisma.driver.count({
        where: { id: record.driverId, deletedAt: null },
      });
      if (found === 0) throw new ValidationError('That driver no longer exists');
    }
  }

  async productValuation(
    productIds: UUID[],
  ): Promise<Map<string, { rate: number; gstRate: number }>> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, landingCost: true, gstRate: true },
    });
    return new Map(
      products.map((product) => [
        product.id,
        { rate: num(product.landingCost), gstRate: num(product.gstRate) },
      ]),
    );
  }

  /**
   * Writes a movement and moves the balance projection with it.
   *
   * Shared by all three legs so the ledger and the projection can never be updated by
   * one path and not another.
   */
  private async post(
    tx: Prisma.TransactionClient,
    postings: MovementPosting[],
    refId: string,
    refNumber: string,
  ): Promise<void> {
    for (const posting of postings) {
      await tx.stockMovement.create({
        data: {
          productId: posting.productId,
          branchId: posting.branchId,
          godownId: posting.godownId,
          gateId: posting.gateId ?? null,
          batchNo: posting.batchNo ?? null,
          shade: posting.shade ?? null,
          type: posting.type,
          direction: posting.direction,
          qtyBoxes: posting.qtyBoxes,
          refType: 'TRANSFER',
          refId,
          refNumber,
          remarks: posting.remarks ?? null,
          movementDate: posting.movementDate,
          createdBy: posting.createdBy,
        },
      });

      const delta = posting.direction === 'IN' ? posting.qtyBoxes : -posting.qtyBoxes;
      const existing = await tx.stockBalance.findFirst({
        where: {
          productId: posting.productId,
          branchId: posting.branchId,
          godownId: posting.godownId,
          gateId: posting.gateId ?? null,
          batchNo: posting.batchNo ?? null,
          shade: posting.shade ?? null,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.stockBalance.update({
          where: { id: existing.id },
          data: { qtyBoxes: { increment: delta } },
        });
      } else {
        await tx.stockBalance.create({
          data: {
            productId: posting.productId,
            branchId: posting.branchId,
            godownId: posting.godownId,
            gateId: posting.gateId ?? null,
            batchNo: posting.batchNo ?? null,
            shade: posting.shade ?? null,
            qtyBoxes: delta,
          },
        });
      }
    }
  }

  /**
   * Writes the transfer, its lines and the OUT leg together, so stock can never leave a
   * godown without a document saying where it went.
   */
  async create(record: TransferRecord, postings: MovementPosting[]): Promise<StockTransferItem> {
    const created = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNo: record.transferNo,
          documentNo: record.documentNo,
          documentType: record.documentType,
          status: 'IN_TRANSIT',
          fromBranchId: record.fromBranchId,
          fromGodownId: record.fromGodownId,
          toBranchId: record.toBranchId,
          toGodownId: record.toGodownId,
          fromGstin: record.fromGstin,
          toGstin: record.toGstin,
          interState: record.interState,
          transferDate: record.transferDate,
          remarks: record.remarks,
          subTotal: record.subTotal,
          cgstAmount: record.cgstAmount,
          sgstAmount: record.sgstAmount,
          igstAmount: record.igstAmount,
          gstAmount: record.gstAmount,
          grandTotal: record.grandTotal,
          transporterId: record.transporterId,
          vehicleId: record.vehicleId,
          driverId: record.driverId,
          lrNumber: record.lrNumber,
          freightCharge: record.freightCharge,
          distanceKm: record.distanceKm,
          ewayBillNo: record.ewayBillNo,
          ewayBillDate: record.ewayBillDate,
          createdBy: record.createdBy,
          lines: {
            create: record.lines.map((line) => ({
              productId: line.productId,
              batchNo: line.batchNo,
              shade: line.shade,
              qtyBoxes: line.qtyBoxes,
              rate: line.rate,
              gstRate: line.gstRate,
              lineSubTotal: line.lineSubTotal,
              lineGst: line.lineGst,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include,
      });

      await this.post(tx, postings, transfer.id, transfer.documentNo);
      return transfer;
    });

    return this.toItem(created, true);
  }

  /**
   * Books the goods in.
   *
   * The status is moved with a guarded update so two storekeepers pressing Receive at
   * the same moment cannot post the IN leg twice: the second one finds no row still in
   * transit and is told so.
   */
  async receive(
    record: ReceiveTransferRecord,
    postings: MovementPosting[],
  ): Promise<StockTransferItem> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockTransfer.updateMany({
        where: { id: record.id, status: 'IN_TRANSIT' },
        data: {
          status: 'RECEIVED',
          receivedAt: record.receivedAt,
          receivedBy: record.receivedBy,
          receivedByName: record.receivedByName,
          receiptRemarks: record.receiptRemarks,
        },
      });
      if (claimed.count === 0) {
        throw new ValidationError('This transfer is no longer in transit');
      }

      for (const line of record.lines) {
        await tx.stockTransferLine.updateMany({
          where: {
            transferId: record.id,
            productId: line.productId,
            batchNo: line.batchNo,
            shade: line.shade,
          },
          data: { qtyReceived: line.qtyReceived },
        });
      }

      const transfer = await tx.stockTransfer.findUniqueOrThrow({
        where: { id: record.id },
        include,
      });
      await this.post(tx, postings, transfer.id, transfer.documentNo);
      return transfer;
    });

    return this.toItem(updated, true);
  }

  async cancel(
    record: CancelTransferRecord,
    postings: MovementPosting[],
  ): Promise<StockTransferItem> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockTransfer.updateMany({
        where: { id: record.id, status: 'IN_TRANSIT' },
        data: {
          status: 'CANCELLED',
          cancelledAt: record.cancelledAt,
          cancelledBy: record.cancelledBy,
          cancelReason: record.reason,
        },
      });
      if (claimed.count === 0) {
        throw new ValidationError('This transfer is no longer in transit');
      }

      const transfer = await tx.stockTransfer.findUniqueOrThrow({
        where: { id: record.id },
        include,
      });
      await this.post(tx, postings, transfer.id, transfer.documentNo);
      return transfer;
    });

    return this.toItem(updated, true);
  }

  async list(
    query: PaginationQuery,
    filter: TransferListFilter,
  ): Promise<Paginated<StockTransferItem>> {
    const where: Prisma.StockTransferWhereInput = {
      ...(filter.branchId
        ? { OR: [{ fromBranchId: filter.branchId }, { toBranchId: filter.branchId }] }
        : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.fromDate || filter.toDate
        ? {
            transferDate: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      // A number is searched for on either series: whoever is holding the paper is
      // reading the document number, not the internal transfer number.
      ...(query.search
        ? {
            OR: [
              { transferNo: { contains: query.search, mode: 'insensitive' as const } },
              { documentNo: { contains: query.search, mode: 'insensitive' as const } },
              { ewayBillNo: { contains: query.search, mode: 'insensitive' as const } },
              { lrNumber: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include,
        orderBy: { transferDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    const items = await Promise.all(rows.map((row) => this.toItem(row, false)));
    return buildPaginated(items, query.page, query.pageSize, total);
  }

  async findById(id: UUID): Promise<StockTransferItem | null> {
    const row = await this.prisma.stockTransfer.findUnique({ where: { id }, include });
    return row ? this.toItem(row, true) : null;
  }

  /**
   * The document, with both branches as consignor and consignee.
   *
   * The GSTINs come off the branch masters as they stand now, but what was frozen on the
   * transfer is what the item carries — so a document reprinted after a GSTIN was
   * corrected still shows the registration it was raised under.
   */
  async printData(id: UUID): Promise<TransferPrintData | null> {
    const row = await this.prisma.stockTransfer.findUnique({ where: { id }, include });
    if (!row) return null;

    const [company, fromBranch, toBranch] = await Promise.all([
      this.prisma.company.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          name: true,
          legalName: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          pincode: true,
          phone: true,
          email: true,
          gstin: true,
        },
      }),
      this.prisma.branch.findUnique({
        where: { id: row.fromBranchId },
        select: branchLetterhead,
      }),
      this.prisma.branch.findUnique({ where: { id: row.toBranchId }, select: branchLetterhead }),
    ]);

    const blank = {
      name: '',
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      pincode: null,
      phone: null,
      email: null,
      gstin: null,
    };

    return {
      transfer: await this.toItem(row, true),
      company: toPartyBlock(company ?? blank),
      fromBranch: toPartyBlock(fromBranch ?? blank),
      toBranch: toPartyBlock(toBranch ?? blank),
    };
  }
}
