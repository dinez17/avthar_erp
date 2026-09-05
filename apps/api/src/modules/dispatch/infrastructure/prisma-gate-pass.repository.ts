import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  buildPaginated,
  ConflictError,
  formatStockQuantity,
  NotFoundError,
  ValidationError,
} from '@tiles-erp/shared';
import type {
  GatePassDocumentItem,
  GatePassItem,
  GatePassLineItem,
  GatePassPrintData,
  Paginated,
  PaginationQuery,
  PendingDispatchInvoice,
  UUID,
} from '@tiles-erp/shared-types';
import { DocumentNumberService } from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { toPartyBlock } from '../../sales/infrastructure/letterhead';
import {
  assertOdometer,
  assertTransition,
  cashVariance,
  dispatchStatusOf,
  freightMargin,
  freightOutstanding,
  freightToCollect,
  movesStock,
  round2,
  round3,
  shortQty,
  tripDistance,
} from '../application/dispatch.rules';
import type {
  CloseTripData,
  DeliveryData,
  GatePassFilter,
  GatePassRepository,
  GatePassWriteData,
} from '../domain/gate-pass.repository';

const include = {
  branch: { select: { name: true } },
  gate: { select: { name: true } },
  customer: { select: { name: true } },
  toBranch: { select: { name: true } },
  documents: true,
  lines: {
    include: {
      product: { select: { sku: true, name: true, piecesPerBox: true, baseUom: true } },
      godown: { select: { name: true } },
    },
  },
} satisfies Prisma.GatePassInclude;

type Row = Prisma.GatePassGetPayload<{ include: typeof include }>;

/** The subset of the client a helper needs; the same code runs inside a transaction. */
type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

const toDocument = (
  document: Row['documents'][number],
  loadedByDocument: Map<string, number>,
): GatePassDocumentItem => {
  const freightCharge = Number(document.freightCharge);
  const billedFreight = Number(document.billedFreight);
  const paidAtBranch = Number(document.freightPaidAtBranch);
  const collected = Number(document.freightCollected);
  const toCollect = freightToCollect(freightCharge, billedFreight, paidAtBranch);
  return {
    id: document.id,
    salesInvoiceId: document.salesInvoiceId,
    stockTransferId: document.stockTransferId,
    customerId: document.customerId,
    customerName: document.customerName,
    deliveryAddress: document.deliveryAddress,
    sequence: document.sequence,
    freightCharge,
    billedFreight,
    freightPaidAtBranch: paidAtBranch,
    freightCollected: collected,
    freightToCollect: toCollect,
    freightOutstanding: freightOutstanding(toCollect, collected),
    documentNumber: document.documentNumber,
    documentDate: document.documentDate.toISOString(),
    documentValue: Number(document.documentValue),
    qtyBoxes: round3(loadedByDocument.get(document.id) ?? 0),
  };
};

const toLine = (
  line: Row['lines'][number],
  documentNumbers: Map<string, string>,
): GatePassLineItem => {
  const docQtyBoxes = Number(line.docQtyBoxes);
  const qtyBoxes = Number(line.qtyBoxes);
  return {
    id: line.id,
    documentId: line.documentId,
    documentNumber: line.documentId ? (documentNumbers.get(line.documentId) ?? null) : null,
    productId: line.productId,
    productCode: line.product.sku,
    productName: line.product.name,
    piecesPerBox: line.product.piecesPerBox,
    baseUom: line.product.baseUom,
    godownId: line.godownId,
    godownName: line.godown.name,
    gateId: line.gateId,
    batchNo: line.batchNo,
    shade: line.shade,
    docQtyBoxes,
    boxes: line.boxes,
    pieces: line.pieces,
    qtyBoxes,
    shortQtyBoxes: shortQty(docQtyBoxes, qtyBoxes),
    remarks: line.remarks,
  };
};

const toItem = (row: Row, withDetail: boolean): GatePassItem => {
  const documents = [...row.documents].sort(
    (a, b) => a.sequence - b.sequence || a.documentNumber.localeCompare(b.documentNumber),
  );
  const documentNumbers = new Map(documents.map((doc) => [doc.id, doc.documentNumber]));
  const lines = row.lines.map((line) => toLine(line, documentNumbers));
  const hireCharge = Number(row.hireCharge);
  const billedFreight = Number(row.billedFreight);

  // The round's freight is the drops added up, not a figure typed on the header.
  const chargedFreight = round2(
    documents.reduce((sum, document) => sum + Number(document.freightCharge), 0),
  );
  const toCollect = round2(
    documents.reduce(
      (sum, document) =>
        sum +
        freightToCollect(
          Number(document.freightCharge),
          Number(document.billedFreight),
          Number(document.freightPaidAtBranch),
        ),
      0,
    ),
  );
  const collected = round2(
    documents.reduce((sum, document) => sum + Number(document.freightCollected), 0),
  );
  const cash = Number(row.cashHandedOver);

  const loadedByDocument = new Map<string, number>();
  for (const line of row.lines) {
    if (!line.documentId) continue;
    loadedByDocument.set(
      line.documentId,
      (loadedByDocument.get(line.documentId) ?? 0) + Number(line.qtyBoxes),
    );
  }

  // Each customer once, in drop order — a round can carry two invoices for the same one.
  const customerNames = [
    ...new Set(
      documents
        .map((document) => document.customerName)
        .filter((name): name is string => name !== null),
    ),
  ];

  return {
    id: row.id,
    gatePassNo: row.gatePassNo,
    type: row.type,
    status: row.status,
    branchId: row.branchId,
    branchName: row.branch.name,
    gateId: row.gateId,
    gateName: row.gate?.name ?? null,
    passDate: row.passDate.toISOString(),
    customerId: row.customerId,
    customerName: row.customer?.name ?? customerNames[0] ?? null,
    customerNames,
    toBranchId: row.toBranchId,
    toBranchName: row.toBranch?.name ?? null,
    destination: row.destination,
    transporterId: row.transporterId,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    vehicleNumber: row.vehicleNumber,
    driverName: row.driverName,
    driverPhone: row.driverPhone,
    transporterName: row.transporterName,
    hireCharge,
    advancePaid: Number(row.advancePaid),
    billedFreight,
    chargedFreight,
    freightToCollect: toCollect,
    freightCollected: collected,
    freightOutstanding: round2(Math.max(0, toCollect - collected)),
    freightMargin: freightMargin(chargedFreight, hireCharge),
    startKm: row.startKm,
    endKm: row.endKm,
    tripKm: tripDistance(row.startKm, row.endKm),
    closedAt: row.closedAt?.toISOString() ?? null,
    cashHandedOver: cash,
    cashVariance: cashVariance(cash, collected),
    closeRemarks: row.closeRemarks,
    returnable: row.returnable,
    expectedReturnDate: row.expectedReturnDate?.toISOString() ?? null,
    returnedAt: row.returnedAt?.toISOString() ?? null,
    loadedAt: row.loadedAt?.toISOString() ?? null,
    gatedOutAt: row.gatedOutAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    receivedByName: row.receivedByName,
    receivedByPhone: row.receivedByPhone,
    podRemarks: row.podRemarks,
    cancelReason: row.cancelReason,
    remarks: row.remarks,
    documentCount: row.documents.length,
    lineCount: lines.length,
    totalBoxes: round3(lines.reduce((sum, line) => sum + line.qtyBoxes, 0)),
    hasShortLoad: lines.some((line) => line.shortQtyBoxes > 0),
    version: row.version,
    ...(withDetail
      ? { documents: documents.map((document) => toDocument(document, loadedByDocument)), lines }
      : {}),
  };
};

@Injectable()
export class PrismaGatePassRepository implements GatePassRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  async nextGatePassNumber(branchId?: UUID): Promise<string> {
    return this.numbering.next(this.prisma, 'GATE_PASS', branchId ?? null);
  }

  async list(query: PaginationQuery, filter: GatePassFilter): Promise<Paginated<GatePassItem>> {
    const where: Prisma.GatePassWhereInput = {
      deletedAt: null,
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      // A round's header names no customer, so the filter has to look at the documents.
      ...(filter.customerId
        ? { documents: { some: { customerId: filter.customerId } } }
        : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? {
            passDate: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { gatePassNo: { contains: query.search, mode: 'insensitive' } },
              { vehicleNumber: { contains: query.search, mode: 'insensitive' } },
              { driverName: { contains: query.search, mode: 'insensitive' } },
              {
                documents: {
                  some: {
                    OR: [
                      { documentNumber: { contains: query.search, mode: 'insensitive' } },
                      { customerName: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.gatePass.findMany({
        where,
        include,
        orderBy: { passDate: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.gatePass.count({ where }),
    ]);

    return buildPaginated(
      rows.map((row) => toItem(row, false)),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: UUID): Promise<GatePassItem | null> {
    const row = await this.prisma.gatePass.findFirst({ where: { id, deletedAt: null }, include });
    return row ? toItem(row, true) : null;
  }

  async create(number: string, data: GatePassWriteData, createdBy: UUID): Promise<GatePassItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.gatePass.create({
        data: { ...this.header(data), gatePassNo: number, createdBy },
      });
      await this.writeContents(tx, created.id, data);
      return tx.gatePass.findFirstOrThrow({ where: { id: created.id }, include });
    });
    return toItem(row, true);
  }

  async update(
    id: UUID,
    version: number,
    data: GatePassWriteData,
    updatedBy: UUID,
  ): Promise<GatePassItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.gatePass.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError('Gate pass not found');
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only a draft gate pass can be edited');
      }

      const updated = await tx.gatePass.updateMany({
        where: { id, version },
        data: { ...this.header(data), updatedBy, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new ConflictError('Gate pass was modified by someone else. Reload and retry.');
      }

      // Documents cascade to their lines, so the order here matters.
      await tx.gatePassLine.deleteMany({ where: { gatePassId: id } });
      await tx.gatePassDocument.deleteMany({ where: { gatePassId: id } });
      await this.writeContents(tx, id, data);

      return tx.gatePass.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async softDelete(id: UUID, deletedBy: UUID): Promise<void> {
    const pass = await this.prisma.gatePass.findFirst({ where: { id, deletedAt: null } });
    if (!pass) throw new NotFoundError('Gate pass not found');
    if (pass.status !== 'DRAFT') {
      throw new ValidationError('Only a draft gate pass can be deleted; cancel it instead');
    }
    await this.prisma.gatePass.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  async setLoaded(
    id: UUID,
    version: number,
    loaded: boolean,
    actorId: UUID,
  ): Promise<GatePassItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const pass = await tx.gatePass.findFirst({ where: { id, deletedAt: null }, include });
      if (!pass) throw new NotFoundError('Gate pass not found');
      assertTransition(pass.status, loaded ? 'LOADED' : 'DRAFT');
      if (loaded && pass.lines.length === 0) {
        throw new ValidationError('Nothing has been loaded onto this gate pass');
      }

      await this.transition(tx, id, version, {
        status: loaded ? 'LOADED' : 'DRAFT',
        loadedAt: loaded ? new Date() : null,
        loadedBy: loaded ? actorId : null,
        updatedBy: actorId,
      });
      return tx.gatePass.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  /**
   * The vehicle leaves.
   *
   * For a SALES pass this is where each invoice line's dispatched quantity moves and the
   * invoice's dispatch status is recomputed. For a SAMPLE it is also where the stock
   * movement is written, because no invoice ever wrote one. A TRANSFER pass records
   * neither: the transfer posted its own movements when it was made.
   */
  async gateOut(
    id: UUID,
    version: number,
    startKm: number | null,
    actorId: UUID,
  ): Promise<GatePassItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const pass = await tx.gatePass.findFirst({ where: { id, deletedAt: null }, include });
      if (!pass) throw new NotFoundError('Gate pass not found');
      assertTransition(pass.status, 'GATED_OUT');

      if (movesStock(pass.type)) {
        await this.writeSampleMovements(tx, pass, 'OUT', actorId);
      }

      await this.applyDispatch(tx, pass, 1, actorId);

      await this.transition(tx, id, version, {
        status: 'GATED_OUT',
        gatedOutAt: new Date(),
        gatedOutBy: actorId,
        ...(startKm === null ? {} : { startKm }),
        updatedBy: actorId,
      });
      return tx.gatePass.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  /**
   * The vehicle is back at the gate.
   *
   * Three things happen at once and they belong together: the closing odometer reading,
   * what each drop actually settled, and the cash counted off the driver. Recording them
   * separately would leave a trip half-closed if the desk were interrupted.
   */
  async close(
    id: UUID,
    version: number,
    data: CloseTripData,
    actorId: UUID,
    actorName: string,
  ): Promise<GatePassItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const pass = await tx.gatePass.findFirst({ where: { id, deletedAt: null }, include });
      if (!pass) throw new NotFoundError('Gate pass not found');
      assertTransition(pass.status, 'CLOSED');
      assertOdometer(pass.startKm, data.endKm);

      const documentIds = new Set(pass.documents.map((document) => document.id));
      for (const settlement of data.settlements) {
        if (!documentIds.has(settlement.documentId)) {
          throw new ValidationError('A settlement refers to a drop that is not on this pass');
        }
        await tx.gatePassDocument.update({
          where: { id: settlement.documentId },
          data: {
            ...(settlement.freightPaidAtBranch === null
              ? {}
              : { freightPaidAtBranch: settlement.freightPaidAtBranch }),
            ...(settlement.freightCollected === null
              ? {}
              : { freightCollected: settlement.freightCollected }),
          },
        });
      }

      await this.transition(tx, id, version, {
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: actorId,
        closeRemarks: data.closeRemarks,
        ...(data.endKm === null ? {} : { endKm: data.endKm }),
        updatedBy: actorId,
      });

      // Cash counted at the gate is a handover like any other, not a number written on
      // the pass: one record of money changing hands, whether it happens now or at the
      // counter an hour later.
      if (data.cashHandedOver > 0) {
        await tx.driverCashHandover.create({
          data: {
            handoverNo: await this.numbering.next(tx, 'DRIVER_CASH_HANDOVER', pass.branchId),
            branchId: pass.branchId,
            driverId: pass.driverId,
            driverName: pass.driverName ?? 'Not recorded',
            handoverDate: new Date(),
            amount: data.cashHandedOver,
            receivedBy: actorId,
            receivedByName: actorName,
            remarks: 'Handed over when the trip was closed',
            createdBy: actorId,
            lines: { create: [{ gatePassId: id, amount: data.cashHandedOver }] },
          },
        });
        await tx.gatePass.update({
          where: { id },
          data: { cashHandedOver: { increment: data.cashHandedOver } },
        });
      }

      return tx.gatePass.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async deliver(
    id: UUID,
    version: number,
    data: DeliveryData,
    actorId: UUID,
  ): Promise<GatePassItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const pass = await tx.gatePass.findFirst({ where: { id, deletedAt: null } });
      if (!pass) throw new NotFoundError('Gate pass not found');
      assertTransition(pass.status, 'DELIVERED');

      await this.transition(tx, id, version, {
        status: 'DELIVERED',
        deliveredAt: data.deliveredAt,
        deliveredBy: actorId,
        receivedByName: data.receivedByName,
        receivedByPhone: data.receivedByPhone,
        podRemarks: data.podRemarks,
        updatedBy: actorId,
      });
      return tx.gatePass.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  /** Samples coming back: the mirror of the SAMPLE_OUT written when they left. */
  async recordReturn(id: UUID, version: number, actorId: UUID): Promise<GatePassItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const pass = await tx.gatePass.findFirst({ where: { id, deletedAt: null }, include });
      if (!pass) throw new NotFoundError('Gate pass not found');
      if (!pass.returnable) throw new ValidationError('This gate pass is not returnable');
      if (pass.returnedAt) throw new ValidationError('These goods have already been returned');
      if (pass.status !== 'GATED_OUT' && pass.status !== 'DELIVERED') {
        throw new ValidationError('The goods have not left yet');
      }

      await this.writeSampleMovements(tx, pass, 'IN', actorId);

      const updated = await tx.gatePass.updateMany({
        where: { id, version },
        data: {
          returnedAt: new Date(),
          returnedBy: actorId,
          updatedBy: actorId,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('Gate pass was modified by someone else. Reload and retry.');
      }
      return tx.gatePass.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  /** Cancelling after the gate puts the dispatched quantities back on the invoices. */
  async cancel(
    id: UUID,
    version: number,
    reason: string,
    actorId: UUID,
  ): Promise<GatePassItem> {
    const row = await this.prisma.$transaction(async (tx) => {
      const pass = await tx.gatePass.findFirst({ where: { id, deletedAt: null }, include });
      if (!pass) throw new NotFoundError('Gate pass not found');
      assertTransition(pass.status, 'CANCELLED');

      if (pass.status === 'GATED_OUT') {
        if (movesStock(pass.type) && !pass.returnedAt) {
          await this.writeSampleMovements(tx, pass, 'IN', actorId, reason);
        }
        await this.applyDispatch(tx, pass, -1, actorId);
      }

      await this.transition(tx, id, version, {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: actorId,
        cancelReason: reason,
        updatedBy: actorId,
      });
      return tx.gatePass.findFirstOrThrow({ where: { id }, include });
    });
    return toItem(row, true);
  }

  async pendingDispatch(branchId?: UUID, customerId?: UUID): Promise<PendingDispatchInvoice[]> {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        deletedAt: null,
        status: 'POSTED',
        dispatchStatus: { in: ['PENDING', 'PARTIAL'] },
        ...(branchId ? { branchId } : {}),
        ...(customerId ? { customerId } : {}),
      },
      include: {
        lines: {
          include: {
            product: { select: { sku: true, name: true, piecesPerBox: true, baseUom: true } },
          },
        },
      },
      orderBy: { invoiceDate: 'asc' },
      take: 200,
    });

    const godownIds = [
      ...new Set(invoices.flatMap((invoice) => invoice.lines.map((line) => line.godownId))),
    ];
    const godowns = await this.prisma.godown.findMany({
      where: { id: { in: godownIds } },
      select: { id: true, name: true },
    });
    const godownNames = new Map(godowns.map((godown) => [godown.id, godown.name]));

    return invoices
      .map((invoice) => {
        const lines = invoice.lines
          .map((line) => {
            const qtyBoxes = Number(line.qtyBoxes);
            const dispatchedQtyBoxes = Number(line.dispatchedQtyBoxes);
            return {
              salesInvoiceLineId: line.id,
              productId: line.productId,
              productCode: line.product.sku,
              productName: line.product.name,
              piecesPerBox: line.product.piecesPerBox,
              baseUom: line.product.baseUom,
              godownId: line.godownId,
              godownName: godownNames.get(line.godownId) ?? 'Unknown godown',
              gateId: line.gateId,
              batchNo: line.batchNo,
              shade: line.shade,
              qtyBoxes,
              dispatchedQtyBoxes,
              pendingQtyBoxes: round3(Math.max(0, qtyBoxes - dispatchedQtyBoxes)),
            };
          })
          .filter((line) => line.pendingQtyBoxes > 0);

        return {
          salesInvoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate.toISOString(),
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          customerAddress: invoice.customerAddress,
          branchId: invoice.branchId,
          grandTotal: Number(invoice.grandTotal),
          freightCharge: Number(invoice.freightCharge),
          dispatchStatus: invoice.dispatchStatus,
          pendingQtyBoxes: round3(
            lines.reduce((sum, line) => sum + line.pendingQtyBoxes, 0),
          ),
          lines,
        };
      })
      .filter((invoice) => invoice.lines.length > 0);
  }

  async printData(id: UUID): Promise<GatePassPrintData | null> {
    const row = await this.prisma.gatePass.findFirst({ where: { id, deletedAt: null }, include });
    if (!row) return null;

    const branch = await this.prisma.branch.findFirstOrThrow({
      where: { id: row.branchId },
      include: { company: true },
    });

    return {
      gatePass: toItem(row, true),
      company: toPartyBlock(branch.company),
      branch: toPartyBlock(branch),
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private header(data: GatePassWriteData): Omit<Prisma.GatePassUncheckedCreateInput, 'gatePassNo'> {
    return {
      type: data.type,
      branchId: data.branchId,
      gateId: data.gateId,
      passDate: data.passDate,
      customerId: data.customerId,
      toBranchId: data.toBranchId,
      destination: data.destination,
      transporterId: data.transporterId,
      vehicleId: data.vehicleId,
      driverId: data.driverId,
      vehicleNumber: data.vehicleNumber,
      driverName: data.driverName,
      driverPhone: data.driverPhone,
      transporterName: data.transporterName,
      hireCharge: data.hireCharge,
      advancePaid: data.advancePaid,
      billedFreight: data.billedFreight,
      returnable: data.returnable,
      expectedReturnDate: data.expectedReturnDate,
      remarks: data.remarks,
    };
  }

  /**
   * Writes the pass's documents and then its lines, wiring each line to the document row
   * its input key named. The key exists because neither side has an id until now.
   */
  private async writeContents(tx: Tx, gatePassId: UUID, data: GatePassWriteData): Promise<void> {
    const documentIds = new Map<string, string>();
    for (const document of data.documents) {
      const created = await tx.gatePassDocument.create({
        data: {
          gatePassId,
          salesInvoiceId: document.salesInvoiceId,
          stockTransferId: document.stockTransferId,
          customerId: document.customerId,
          customerName: document.customerName,
          deliveryAddress: document.deliveryAddress,
          sequence: document.sequence,
          freightCharge: document.freightCharge,
          billedFreight: document.billedFreight,
          documentNumber: document.documentNumber,
          documentDate: document.documentDate,
          documentValue: document.documentValue,
        },
      });
      documentIds.set(document.key, created.id);
    }

    await tx.gatePassLine.createMany({
      data: data.lines.map((line) => ({
        gatePassId,
        documentId: line.documentKey ? (documentIds.get(line.documentKey) ?? null) : null,
        productId: line.productId,
        godownId: line.godownId,
        gateId: line.gateId,
        batchNo: line.batchNo,
        shade: line.shade,
        docQtyBoxes: line.docQtyBoxes,
        boxes: line.boxes,
        pieces: line.pieces,
        qtyBoxes: line.qtyBoxes,
        remarks: line.remarks,
      })),
    });
  }

  /** Every status change goes through here so the version check is never forgotten. */
  private async transition(
    tx: Tx,
    id: UUID,
    version: number,
    data: Prisma.GatePassUncheckedUpdateInput,
  ): Promise<void> {
    const updated = await tx.gatePass.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new ConflictError('Gate pass was modified by someone else. Reload and retry.');
    }
  }

  /**
   * Moves each invoice line's dispatched quantity by the loaded amount and recomputes the
   * invoice's dispatch status. `sign` is -1 when a gated-out pass is cancelled and the
   * quantities have to come back off.
   */
  private async applyDispatch(tx: Tx, pass: Row, sign: 1 | -1, actorId: UUID): Promise<void> {
    const invoiceIds = [
      ...new Set(
        pass.documents
          .map((document) => document.salesInvoiceId)
          .filter((value): value is string => value !== null),
      ),
    ];
    if (invoiceIds.length === 0) return;

    const invoices = await tx.salesInvoice.findMany({
      where: { id: { in: invoiceIds } },
      include: { lines: true },
    });
    const documentInvoice = new Map(
      pass.documents.map((document) => [document.id, document.salesInvoiceId]),
    );

    for (const invoice of invoices) {
      // Match the pass line back to the invoice line by the stock it came from: the same
      // product out of the same godown, batch and shade is the same line.
      for (const line of pass.lines) {
        if (!line.documentId || documentInvoice.get(line.documentId) !== invoice.id) continue;
        const qty = round3(Number(line.qtyBoxes) * sign);
        if (qty === 0) continue;

        const invoiceLine = invoice.lines.find(
          (candidate) =>
            candidate.productId === line.productId &&
            candidate.godownId === line.godownId &&
            candidate.batchNo === line.batchNo &&
            candidate.shade === line.shade,
        );
        if (!invoiceLine) continue;

        await tx.salesInvoiceLine.update({
          where: { id: invoiceLine.id },
          data: { dispatchedQtyBoxes: { increment: qty } },
        });
      }

      const fresh = await tx.salesInvoiceLine.findMany({
        where: { salesInvoiceId: invoice.id },
        select: { qtyBoxes: true, dispatchedQtyBoxes: true },
      });
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          dispatchStatus: dispatchStatusOf(
            fresh.map((line) => ({
              qtyBoxes: Number(line.qtyBoxes),
              dispatchedQtyBoxes: Number(line.dispatchedQtyBoxes),
            })),
          ),
          updatedBy: actorId,
        },
      });
    }
  }

  /**
   * A sample gate pass is its own stock event, so it reduces the balance the way a sale
   * would — and refuses when the stock is not there, for the same reason.
   */
  private async writeSampleMovements(
    tx: Tx,
    pass: Row,
    direction: 'OUT' | 'IN',
    actorId: UUID,
    reason?: string,
  ): Promise<void> {
    for (const line of pass.lines) {
      const qty = round3(Number(line.qtyBoxes));
      if (qty <= 0) continue;

      const key = {
        productId: line.productId,
        branchId: pass.branchId,
        godownId: line.godownId,
        gateId: line.gateId,
        batchNo: line.batchNo,
        shade: line.shade,
      };

      const balance = await tx.stockBalance.findFirst({ where: key, select: { id: true, qtyBoxes: true } });

      if (direction === 'OUT') {
        const available = balance ? Number(balance.qtyBoxes) : 0;
        if (available < qty) {
          throw new ValidationError(
            // Spoken in the product's own unit: a tile sold by the piece is short by
            // pieces, not by boxes.
            `${line.product.sku}: that godown has only ${formatStockQuantity(available, line.product.piecesPerBox, 0, line.product.baseUom)}, cannot send ${formatStockQuantity(qty, line.product.piecesPerBox, 0, line.product.baseUom)} out`,
          );
        }
      }

      await tx.stockMovement.create({
        data: {
          ...key,
          type: direction === 'OUT' ? 'SAMPLE_OUT' : 'SAMPLE_IN',
          direction,
          qtyBoxes: qty,
          refType: 'GATE_PASS',
          refId: pass.id,
          refNumber: pass.gatePassNo,
          reason: reason ?? null,
          movementDate: new Date(),
          createdBy: actorId,
        },
      });

      if (balance) {
        await tx.stockBalance.update({
          where: { id: balance.id },
          data: {
            qtyBoxes: direction === 'OUT' ? { decrement: qty } : { increment: qty },
          },
        });
      } else {
        // Only reachable coming back in: an OUT with no balance was refused above.
        await tx.stockBalance.create({ data: { ...key, qtyBoxes: qty } });
      }
    }
  }
}
