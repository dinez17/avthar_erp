import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import {
  isInterStateSupply,
  isOpenTransfer,
  NotFoundError,
  shortQty,
  transferDocumentType,
  transferTotals,
  ValidationError,
  valueTransferLine,
} from '@tiles-erp/shared';
import type {
  CancelTransferInput,
  CreateTransferInput,
  Paginated,
  PaginationQuery,
  ReceiveTransferInput,
  StockTransferItem,
  TransferPrintData,
  UUID,
} from '@tiles-erp/shared-types';
import {
  STOCK_REPOSITORY,
  type MovementPosting,
  type StockRepository,
} from '../domain/stock.repository';
import {
  TRANSFER_REPOSITORY,
  type ReceiptLine,
  type TransferListFilter,
  type TransferRecordLine,
  type TransferRepository,
} from '../domain/transfer.repository';

const MAX_LINES = 200;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** How a line is identified, so a receipt can be matched back to what was sent. */
const lineKey = (
  productId: UUID,
  batchNo: string | null,
  shade: string | null,
): string => `${productId}|${batchNo ?? ''}|${shade ?? ''}`;

export class ListTransfersQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: TransferListFilter,
  ) {}
}

export class GetTransferQuery {
  constructor(public readonly id: UUID) {}
}

export class GetTransferPrintQuery {
  constructor(public readonly id: UUID) {}
}

export class CreateTransferCommand {
  constructor(
    public readonly data: CreateTransferInput,
    public readonly actorId: UUID,
  ) {}
}

export class ReceiveTransferCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: ReceiveTransferInput,
    public readonly actorId: UUID,
  ) {}
}

export class CancelTransferCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: CancelTransferInput,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListTransfersQuery)
export class ListTransfersHandler
  implements IQueryHandler<ListTransfersQuery, Paginated<StockTransferItem>>
{
  constructor(@Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository) {}

  execute(query: ListTransfersQuery): Promise<Paginated<StockTransferItem>> {
    return this.transfers.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetTransferQuery)
export class GetTransferHandler implements IQueryHandler<GetTransferQuery, StockTransferItem> {
  constructor(@Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository) {}

  async execute(query: GetTransferQuery): Promise<StockTransferItem> {
    const transfer = await this.transfers.findById(query.id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    return transfer;
  }
}

@QueryHandler(GetTransferPrintQuery)
export class GetTransferPrintHandler
  implements IQueryHandler<GetTransferPrintQuery, TransferPrintData>
{
  constructor(@Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository) {}

  async execute(query: GetTransferPrintQuery): Promise<TransferPrintData> {
    const data = await this.transfers.printData(query.id);
    if (!data) throw new NotFoundError('Transfer not found');
    return data;
  }
}

/**
 * Dispatches a transfer: stock leaves the source godown, and the paper that travels with
 * it is raised.
 *
 * Only the OUT leg posts here. Goods on a lorry are in neither godown, and pretending
 * they arrived the instant they left is what hides a short delivery — so the IN leg
 * waits for someone at the far end to count them.
 */
@CommandHandler(CreateTransferCommand)
export class CreateTransferHandler
  implements ICommandHandler<CreateTransferCommand, StockTransferItem>
{
  constructor(
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(STOCK_REPOSITORY) private readonly stock: StockRepository,
  ) {}

  async execute(command: CreateTransferCommand): Promise<StockTransferItem> {
    const { fromBranchId, fromGodownId, toBranchId, toGodownId, lines, remarks } = command.data;

    if (fromGodownId === toGodownId) {
      throw new ValidationError('Source and destination godowns must differ');
    }
    if (lines.length === 0) throw new ValidationError('At least one line is required');
    if (lines.length > MAX_LINES) {
      throw new ValidationError(`At most ${MAX_LINES} lines per transfer`);
    }

    const facts = await this.transfers.assertEndpoints({
      fromBranchId,
      fromGodownId,
      toBranchId,
      toGodownId,
    });
    await this.transfers.assertCarrier({
      transporterId: command.data.transporterId ?? null,
      vehicleId: command.data.vehicleId ?? null,
      driverId: command.data.driverId ?? null,
    });

    // The document decides itself. Two branches on one GSTIN are one person under GST,
    // so moving stock between them is not a supply and carries no tax.
    const documentType = transferDocumentType(facts.fromGstin, facts.toGstin);
    const taxable = documentType === 'TAX_INVOICE';
    const interState = isInterStateSupply(facts.fromStateCode, facts.toStateCode);

    const conversions = await this.stock.productConversions(lines.map((l) => l.productId));
    const valuation = await this.transfers.productValuation(lines.map((l) => l.productId));

    const seen = new Set<string>();
    const resolved: TransferRecordLine[] = [];

    for (const line of lines) {
      const conversion = conversions.get(line.productId);
      if (!conversion) throw new ValidationError('One or more products no longer exist');
      if (line.boxes < 0 || line.pieces < 0) {
        throw new ValidationError('Transfer quantities cannot be negative');
      }

      const qtyBoxes = round3(
        line.boxes + (line.pieces > 0 ? line.pieces / conversion.piecesPerBox : 0),
      );
      if (qtyBoxes <= 0) throw new ValidationError('Every line needs a quantity greater than zero');

      const key = lineKey(line.productId, line.batchNo ?? null, line.shade ?? null);
      if (seen.has(key)) {
        throw new ValidationError(
          'The same product/batch/shade appears more than once; combine those lines',
        );
      }
      seen.add(key);

      const available = await this.stock.currentQty({
        productId: line.productId,
        branchId: fromBranchId,
        godownId: fromGodownId,
        gateId: null,
        batchNo: line.batchNo ?? null,
        shade: line.shade ?? null,
      });
      if (available < qtyBoxes) {
        throw new ValidationError(
          `${conversion.sku}: only ${available} boxes available at the source godown, cannot transfer ${qtyBoxes}`,
        );
      }

      // Landing cost is the default because it is what the stock cost you, which is the
      // value a challan should state. A typed rate wins, for the rare consignment that
      // has to be declared at something else.
      const product = valuation.get(line.productId);
      const rate = line.rate !== undefined && line.rate !== null ? line.rate : (product?.rate ?? 0);
      if (rate < 0) throw new ValidationError('A rate cannot be negative');
      const gstRate = product?.gstRate ?? 0;

      resolved.push({
        productId: line.productId,
        batchNo: line.batchNo ?? null,
        shade: line.shade ?? null,
        qtyBoxes,
        rate,
        gstRate,
        ...valueTransferLine({ qtyBoxes, rate, gstRate }, taxable),
      });
    }

    const totals = transferTotals(resolved, interState);
    const transferDate = command.data.transferDate
      ? new Date(command.data.transferDate)
      : new Date();
    const [transferNo, documentNo] = await Promise.all([
      this.transfers.nextTransferNo(fromBranchId),
      this.transfers.nextDocumentNo(documentType, fromBranchId),
    ]);

    const postings: MovementPosting[] = resolved.map((line) => ({
      productId: line.productId,
      branchId: fromBranchId,
      godownId: fromGodownId,
      batchNo: line.batchNo,
      shade: line.shade,
      type: 'TRANSFER_OUT',
      direction: 'OUT',
      qtyBoxes: line.qtyBoxes,
      remarks: remarks ?? null,
      movementDate: transferDate,
      createdBy: command.actorId,
    }));

    return this.transfers.create(
      {
        transferNo,
        documentNo,
        documentType,
        fromBranchId,
        fromGodownId,
        toBranchId,
        toGodownId,
        fromGstin: facts.fromGstin,
        toGstin: facts.toGstin,
        interState,
        transferDate,
        remarks: remarks ?? null,
        ...totals,
        transporterId: command.data.transporterId ?? null,
        vehicleId: command.data.vehicleId ?? null,
        driverId: command.data.driverId ?? null,
        lrNumber: command.data.lrNumber ?? null,
        freightCharge: command.data.freightCharge ?? 0,
        distanceKm: command.data.distanceKm ?? null,
        ewayBillNo: command.data.ewayBillNo ?? null,
        ewayBillDate: command.data.ewayBillDate ? new Date(command.data.ewayBillDate) : null,
        createdBy: command.actorId,
        lines: resolved,
      },
      postings,
    );
  }
}

/**
 * Books a transfer in at the destination.
 *
 * Only what arrived is posted IN. The shortfall is not posted anywhere: it left the
 * source and never reached the destination, and the ledger already says exactly that.
 * Writing it back would invent stock that is broken on a roadside.
 */
@CommandHandler(ReceiveTransferCommand)
export class ReceiveTransferHandler
  implements ICommandHandler<ReceiveTransferCommand, StockTransferItem>
{
  constructor(@Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository) {}

  async execute(command: ReceiveTransferCommand): Promise<StockTransferItem> {
    const transfer = await this.transfers.findById(command.id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    if (!isOpenTransfer(transfer.status)) {
      throw new ValidationError(
        transfer.status === 'RECEIVED'
          ? 'This transfer has already been received. Correct a miscount with a stock adjustment against the destination godown.'
          : 'This transfer was cancelled, so there is nothing to receive',
      );
    }
    if (!transfer.lines) throw new NotFoundError('Transfer lines not found');

    const receivedName = command.data.receivedByName.trim();
    if (!receivedName) throw new ValidationError('Name of the person receiving is required');

    const counted = new Map<string, number>();
    for (const line of command.data.lines ?? []) {
      const key = lineKey(line.productId, line.batchNo ?? null, line.shade ?? null);
      if (counted.has(key)) {
        throw new ValidationError('The same product/batch/shade was counted twice');
      }
      if (line.qtyReceived < 0) throw new ValidationError('A received quantity cannot be negative');
      counted.set(key, round3(line.qtyReceived));
    }

    const receivedAt = command.data.receivedAt ? new Date(command.data.receivedAt) : new Date();
    const receipt: ReceiptLine[] = [];
    const postings: MovementPosting[] = [];

    for (const line of transfer.lines) {
      const key = lineKey(line.productId, line.batchNo, line.shade);
      // A line nobody mentioned arrived in full. That is the common case, and making
      // the storekeeper retype every quantity to say "all fine" invites typos.
      const qtyReceived = counted.get(key) ?? line.qtyBoxes;
      if (qtyReceived > line.qtyBoxes) {
        throw new ValidationError(
          `${line.sku}: ${qtyReceived} received against ${line.qtyBoxes} sent. More cannot arrive than left.`,
        );
      }
      counted.delete(key);

      receipt.push({
        productId: line.productId,
        batchNo: line.batchNo,
        shade: line.shade,
        qtyReceived,
      });

      if (qtyReceived > 0) {
        postings.push({
          productId: line.productId,
          branchId: transfer.toBranchId,
          godownId: transfer.toGodownId,
          batchNo: line.batchNo,
          shade: line.shade,
          type: 'TRANSFER_IN',
          direction: 'IN',
          qtyBoxes: qtyReceived,
          remarks:
            shortQty(line.qtyBoxes, qtyReceived) > 0
              ? `Short by ${shortQty(line.qtyBoxes, qtyReceived)} of ${line.qtyBoxes}`
              : null,
          movementDate: receivedAt,
          createdBy: command.actorId,
        });
      }
    }

    if (counted.size > 0) {
      throw new ValidationError('A counted line does not appear on this transfer');
    }

    return this.transfers.receive(
      {
        id: command.id,
        receivedAt,
        receivedBy: command.actorId,
        receivedByName: receivedName,
        receiptRemarks: command.data.receiptRemarks?.trim() || null,
        lines: receipt,
      },
      postings,
    );
  }
}

/**
 * Turns a transfer back before it arrives, returning the stock to the source godown.
 *
 * The return posts as TRANSFER_IN at the source rather than reversing the original
 * movement, because the ledger is append-only: what left is a fact, and the lorry coming
 * back is a second fact.
 */
@CommandHandler(CancelTransferCommand)
export class CancelTransferHandler
  implements ICommandHandler<CancelTransferCommand, StockTransferItem>
{
  constructor(@Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository) {}

  async execute(command: CancelTransferCommand): Promise<StockTransferItem> {
    const transfer = await this.transfers.findById(command.id);
    if (!transfer) throw new NotFoundError('Transfer not found');
    if (!isOpenTransfer(transfer.status)) {
      throw new ValidationError(
        transfer.status === 'RECEIVED'
          ? 'This transfer has already been received; send it back as a new transfer'
          : 'This transfer is already cancelled',
      );
    }
    if (!transfer.lines) throw new NotFoundError('Transfer lines not found');

    const reason = command.data.reason.trim();
    if (!reason) throw new ValidationError('A reason is required to cancel a transfer');

    const cancelledAt = new Date();
    const postings: MovementPosting[] = transfer.lines.map((line) => ({
      productId: line.productId,
      branchId: transfer.fromBranchId,
      godownId: transfer.fromGodownId,
      batchNo: line.batchNo,
      shade: line.shade,
      type: 'TRANSFER_IN',
      direction: 'IN',
      qtyBoxes: line.qtyBoxes,
      remarks: `Transfer ${transfer.transferNo} turned back: ${reason}`,
      movementDate: cancelledAt,
      createdBy: command.actorId,
    }));

    return this.transfers.cancel(
      { id: command.id, cancelledAt, cancelledBy: command.actorId, reason },
      postings,
    );
  }
}
