import { Inject } from '@nestjs/common';
import { CommandHandler, QueryHandler, type ICommandHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CloseTripInput,
  CreateGatePassInput,
  DeliverGatePassInput,
  GatePassItem,
  GatePassPrintData,
  Paginated,
  PaginationQuery,
  PendingDispatchInvoice,
  UpdateGatePassInput,
  UUID,
} from '@tiles-erp/shared-types';
import {
  GATE_PASS_REPOSITORY,
  type DropSettlement,
  type GatePassFilter,
  type GatePassRepository,
  type GatePassWriteData,
  type ResolvedGatePassDocument,
  type ResolvedGatePassLine,
} from '../domain/gate-pass.repository';
import { GATE_PASS_SOURCE, type GatePassSource } from '../domain/gate-pass-source';
import {
  assertAdvance,
  assertDestination,
  assertNotOverloaded,
  commonCustomer,
  round2,
  round3,
} from './dispatch.rules';

export class ListGatePassesQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: GatePassFilter,
  ) {}
}

export class GetGatePassQuery {
  constructor(public readonly id: UUID) {}
}

export class GatePassPrintQuery {
  constructor(public readonly id: UUID) {}
}

export class PendingDispatchQuery {
  constructor(
    public readonly branchId?: UUID,
    public readonly customerId?: UUID,
  ) {}
}

export class CreateGatePassCommand {
  constructor(
    public readonly data: CreateGatePassInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdateGatePassCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateGatePassInput,
    public readonly actorId: UUID,
  ) {}
}

export class SetGatePassLoadedCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly loaded: boolean,
    public readonly actorId: UUID,
  ) {}
}

export class GateOutCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly startKm: number | null,
    public readonly actorId: UUID,
  ) {}
}

export class CloseTripCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: CloseTripInput,
    public readonly actorId: UUID,
    public readonly actorName: string,
  ) {}
}

export class DeliverGatePassCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: DeliverGatePassInput,
    public readonly actorId: UUID,
  ) {}
}

export class ReturnGatePassCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

export class CancelGatePassCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly reason: string,
    public readonly actorId: UUID,
  ) {}
}

export class DeleteGatePassCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

/**
 * Turns the pass as typed into the pass as stored.
 *
 * The documents are re-read rather than trusted: their number, date, value and **customer**
 * are copied onto the pass so a later edit to the invoice cannot rewrite what the gate let
 * out, and the customer's freight is summed from them so the trip's margin needs no join.
 *
 * Several customers on one pass is the ordinary case — a lorry does a round — so nothing
 * here requires the invoices to agree about whose they are.
 */
async function buildGatePassData(
  source: GatePassSource,
  input: CreateGatePassInput,
): Promise<GatePassWriteData> {
  const type = input.type;
  assertDestination(type, { customerId: input.customerId, toBranchId: input.toBranchId });

  const documents: ResolvedGatePassDocument[] = [];
  let billedFreight = 0;

  for (const [index, document] of (input.documents ?? []).entries()) {
    const sequence = document.sequence ?? index + 1;
    const deliveryAddress = document.deliveryAddress?.trim() || null;
    const freightCharge = round2(document.freightCharge ?? 0);

    if (document.salesInvoiceId) {
      const invoice = await source.invoiceForDispatch(document.salesInvoiceId);
      if (!invoice) throw new NotFoundError('One of the invoices no longer exists');
      if (invoice.branchId !== input.branchId) {
        throw new ValidationError(
          `${invoice.invoiceNumber} belongs to another branch and cannot leave from this one`,
        );
      }
      documents.push({
        key: document.key,
        salesInvoiceId: invoice.id,
        stockTransferId: null,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        deliveryAddress: deliveryAddress ?? invoice.customerAddress,
        sequence,
        // Left unset, the drop is charged whatever the invoice already billed — which
        // makes nothing collectable at the door and is the right default.
        freightCharge: document.freightCharge === undefined ? invoice.freightCharge : freightCharge,
        billedFreight: invoice.freightCharge,
        documentNumber: invoice.invoiceNumber,
        documentDate: invoice.invoiceDate,
        documentValue: invoice.grandTotal,
      });
      billedFreight = round2(billedFreight + invoice.freightCharge);
      continue;
    }

    if (document.stockTransferId) {
      const transfer = await source.transferForDispatch(document.stockTransferId);
      if (!transfer) throw new NotFoundError('One of the transfers no longer exists');
      documents.push({
        key: document.key,
        salesInvoiceId: null,
        stockTransferId: transfer.id,
        customerId: null,
        customerName: null,
        deliveryAddress,
        sequence,
        freightCharge,
        billedFreight: 0,
        documentNumber: transfer.transferNo,
        documentDate: transfer.transferDate,
        documentValue: 0,
      });
      continue;
    }

    throw new ValidationError('Every document on a gate pass needs an invoice or a transfer');
  }

  if (type !== 'SAMPLE' && documents.length === 0) {
    throw new ValidationError(
      type === 'SALES'
        ? 'Choose at least one invoice to dispatch'
        : 'Choose at least one transfer to dispatch',
    );
  }

  const keys = new Set(documents.map((document) => document.key));
  const lines: ResolvedGatePassLine[] = [];

  for (const line of input.lines) {
    const product = await source.productForLine(line.productId);
    if (!product) throw new NotFoundError('One of the products no longer exists');

    const boxes = Math.max(0, Math.trunc(line.boxes ?? 0));
    const pieces = Math.max(0, Math.trunc(line.pieces ?? 0));
    // Loose pieces are a fraction of a box, the way stock is counted everywhere else.
    const qtyBoxes = round3(boxes + (product.piecesPerBox > 0 ? pieces / product.piecesPerBox : 0));
    if (qtyBoxes <= 0) continue;

    if (line.documentKey && !keys.has(line.documentKey)) {
      throw new ValidationError('A loaded line refers to a document that is not on this pass');
    }
    if (!line.documentKey && type !== 'SAMPLE') {
      throw new ValidationError('Every loaded line must say which document it belongs to');
    }

    lines.push({
      documentKey: line.documentKey ?? null,
      productId: line.productId,
      godownId: line.godownId,
      gateId: line.gateId ?? null,
      batchNo: line.batchNo?.trim() || null,
      shade: line.shade?.trim() || null,
      docQtyBoxes: round3(line.docQtyBoxes ?? 0),
      boxes,
      pieces,
      qtyBoxes,
      remarks: line.remarks?.trim() || null,
    });
  }

  if (lines.length === 0) throw new ValidationError('Nothing has been loaded onto this gate pass');
  assertNotOverloaded(lines);

  const hireCharge = round2(input.hireCharge ?? 0);
  const advancePaid = round2(input.advancePaid ?? 0);
  assertAdvance(hireCharge, advancePaid);

  // The masters are the source of the vehicle and driver, and what they say is copied onto
  // the pass — the printed paper and any later dispute rely on the registration number,
  // not on an id. A typed number is the fallback for a hired lorry nobody has registered.
  const vehicle = input.vehicleId ? await source.vehicle(input.vehicleId) : null;
  if (input.vehicleId && !vehicle) throw new NotFoundError('That vehicle no longer exists');
  const driver = input.driverId ? await source.driver(input.driverId) : null;
  if (input.driverId && !driver) throw new NotFoundError('That driver no longer exists');

  const transporterId = input.transporterId ?? vehicle?.transporterId ?? driver?.transporterId ?? null;
  const transporter = transporterId ? await source.transporter(transporterId) : null;

  // The header customer is a label: set when the whole load is for one customer, and left
  // empty for a delivery round rather than naming whichever drop happens to be first.
  const headerCustomer =
    type === 'TRANSFER'
      ? null
      : (input.customerId ?? commonCustomer(documents.map((document) => document.customerId)));

  return {
    type,
    branchId: input.branchId,
    gateId: input.gateId ?? null,
    passDate: input.passDate ? new Date(input.passDate) : new Date(),
    customerId: headerCustomer,
    toBranchId: type === 'TRANSFER' ? (input.toBranchId ?? null) : null,
    destination: input.destination?.trim() || null,
    transporterId,
    vehicleId: input.vehicleId ?? null,
    driverId: input.driverId ?? null,
    vehicleNumber: vehicle?.number ?? input.vehicleNumber?.trim() ?? null,
    driverName: driver?.name ?? input.driverName?.trim() ?? null,
    driverPhone: driver?.phone ?? input.driverPhone?.trim() ?? null,
    transporterName: transporter?.name ?? null,
    hireCharge,
    advancePaid,
    billedFreight,
    // Samples are the returnable case; an invoiced load is not coming back.
    returnable: type === 'SAMPLE' ? (input.returnable ?? true) : false,
    expectedReturnDate: input.expectedReturnDate ? new Date(input.expectedReturnDate) : null,
    remarks: input.remarks?.trim() || null,
    documents,
    lines,
  };
}

@QueryHandler(ListGatePassesQuery)
export class ListGatePassesHandler
  implements IQueryHandler<ListGatePassesQuery, Paginated<GatePassItem>>
{
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  execute(query: ListGatePassesQuery): Promise<Paginated<GatePassItem>> {
    return this.passes.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetGatePassQuery)
export class GetGatePassHandler implements IQueryHandler<GetGatePassQuery, GatePassItem> {
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  async execute(query: GetGatePassQuery): Promise<GatePassItem> {
    const pass = await this.passes.findById(query.id);
    if (!pass) throw new NotFoundError('Gate pass not found');
    return pass;
  }
}

@QueryHandler(GatePassPrintQuery)
export class GatePassPrintHandler implements IQueryHandler<GatePassPrintQuery, GatePassPrintData> {
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  async execute(query: GatePassPrintQuery): Promise<GatePassPrintData> {
    const data = await this.passes.printData(query.id);
    if (!data) throw new NotFoundError('Gate pass not found');
    return data;
  }
}

@QueryHandler(PendingDispatchQuery)
export class PendingDispatchHandler
  implements IQueryHandler<PendingDispatchQuery, PendingDispatchInvoice[]>
{
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  execute(query: PendingDispatchQuery): Promise<PendingDispatchInvoice[]> {
    return this.passes.pendingDispatch(query.branchId, query.customerId);
  }
}

@CommandHandler(CreateGatePassCommand)
export class CreateGatePassHandler implements ICommandHandler<CreateGatePassCommand, GatePassItem> {
  constructor(
    @Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository,
    @Inject(GATE_PASS_SOURCE) private readonly source: GatePassSource,
  ) {}

  async execute(command: CreateGatePassCommand): Promise<GatePassItem> {
    const data = await buildGatePassData(this.source, command.data);
    const number = await this.passes.nextGatePassNumber(data.branchId);
    return this.passes.create(number, data, command.actorId);
  }
}

@CommandHandler(UpdateGatePassCommand)
export class UpdateGatePassHandler implements ICommandHandler<UpdateGatePassCommand, GatePassItem> {
  constructor(
    @Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository,
    @Inject(GATE_PASS_SOURCE) private readonly source: GatePassSource,
  ) {}

  async execute(command: UpdateGatePassCommand): Promise<GatePassItem> {
    const existing = await this.passes.findById(command.id);
    if (!existing) throw new NotFoundError('Gate pass not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError(
        `Only a draft gate pass can be edited (this one is ${existing.status.toLowerCase().replace('_', ' ')})`,
      );
    }

    const merged: CreateGatePassInput = {
      type: command.data.type ?? existing.type,
      branchId: command.data.branchId ?? existing.branchId,
      gateId: command.data.gateId ?? existing.gateId ?? undefined,
      passDate: command.data.passDate ?? existing.passDate,
      customerId: command.data.customerId ?? existing.customerId ?? undefined,
      toBranchId: command.data.toBranchId ?? existing.toBranchId ?? undefined,
      destination: command.data.destination ?? existing.destination ?? undefined,
      transporterId: command.data.transporterId ?? existing.transporterId ?? undefined,
      vehicleId: command.data.vehicleId ?? existing.vehicleId ?? undefined,
      driverId: command.data.driverId ?? existing.driverId ?? undefined,
      vehicleNumber: command.data.vehicleNumber ?? existing.vehicleNumber ?? undefined,
      driverName: command.data.driverName ?? existing.driverName ?? undefined,
      driverPhone: command.data.driverPhone ?? existing.driverPhone ?? undefined,
      hireCharge: command.data.hireCharge ?? existing.hireCharge,
      advancePaid: command.data.advancePaid ?? existing.advancePaid,
      returnable: command.data.returnable ?? existing.returnable,
      expectedReturnDate: command.data.expectedReturnDate ?? existing.expectedReturnDate ?? undefined,
      remarks: command.data.remarks ?? existing.remarks ?? undefined,
      documents:
        command.data.documents ??
        (existing.documents ?? []).map((document) => ({
          key: document.id,
          salesInvoiceId: document.salesInvoiceId ?? undefined,
          stockTransferId: document.stockTransferId ?? undefined,
          deliveryAddress: document.deliveryAddress ?? undefined,
          sequence: document.sequence,
          freightCharge: document.freightCharge,
        })),
      lines:
        command.data.lines ??
        (existing.lines ?? []).map((line) => ({
          documentKey: line.documentId ?? undefined,
          productId: line.productId,
          godownId: line.godownId,
          gateId: line.gateId ?? undefined,
          batchNo: line.batchNo ?? undefined,
          shade: line.shade ?? undefined,
          docQtyBoxes: line.docQtyBoxes,
          boxes: line.boxes,
          pieces: line.pieces,
          remarks: line.remarks ?? undefined,
        })),
    };

    const data = await buildGatePassData(this.source, merged);
    return this.passes.update(command.id, command.data.version, data, command.actorId);
  }
}

@CommandHandler(SetGatePassLoadedCommand)
export class SetGatePassLoadedHandler
  implements ICommandHandler<SetGatePassLoadedCommand, GatePassItem>
{
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  execute(command: SetGatePassLoadedCommand): Promise<GatePassItem> {
    return this.passes.setLoaded(command.id, command.version, command.loaded, command.actorId);
  }
}

@CommandHandler(GateOutCommand)
export class GateOutHandler implements ICommandHandler<GateOutCommand, GatePassItem> {
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  execute(command: GateOutCommand): Promise<GatePassItem> {
    return this.passes.gateOut(command.id, command.version, command.startKm, command.actorId);
  }
}

@CommandHandler(CloseTripCommand)
export class CloseTripHandler implements ICommandHandler<CloseTripCommand, GatePassItem> {
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  execute(command: CloseTripCommand): Promise<GatePassItem> {
    const settlements: DropSettlement[] = (command.data.settlements ?? []).map((settlement) => ({
      documentId: settlement.documentId,
      freightPaidAtBranch:
        settlement.freightPaidAtBranch === undefined
          ? null
          : round2(settlement.freightPaidAtBranch),
      freightCollected:
        settlement.freightCollected === undefined ? null : round2(settlement.freightCollected),
    }));

    return this.passes.close(
      command.id,
      command.data.version,
      {
        endKm: command.data.endKm ?? null,
        cashHandedOver: round2(command.data.cashHandedOver ?? 0),
        closeRemarks: command.data.closeRemarks?.trim() || null,
        settlements,
      },
      command.actorId,
      command.actorName,
    );
  }
}

@CommandHandler(DeliverGatePassCommand)
export class DeliverGatePassHandler
  implements ICommandHandler<DeliverGatePassCommand, GatePassItem>
{
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  execute(command: DeliverGatePassCommand): Promise<GatePassItem> {
    const receivedByName = command.data.receivedByName.trim();
    if (!receivedByName) {
      throw new ValidationError('Record who took delivery — the pass is the proof');
    }
    return this.passes.deliver(
      command.id,
      command.data.version,
      {
        receivedByName,
        receivedByPhone: command.data.receivedByPhone?.trim() || null,
        deliveredAt: command.data.deliveredAt ? new Date(command.data.deliveredAt) : new Date(),
        podRemarks: command.data.podRemarks?.trim() || null,
      },
      command.actorId,
    );
  }
}

@CommandHandler(ReturnGatePassCommand)
export class ReturnGatePassHandler implements ICommandHandler<ReturnGatePassCommand, GatePassItem> {
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  execute(command: ReturnGatePassCommand): Promise<GatePassItem> {
    return this.passes.recordReturn(command.id, command.version, command.actorId);
  }
}

@CommandHandler(CancelGatePassCommand)
export class CancelGatePassHandler implements ICommandHandler<CancelGatePassCommand, GatePassItem> {
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  execute(command: CancelGatePassCommand): Promise<GatePassItem> {
    const reason = command.reason.trim();
    if (!reason) throw new ValidationError('A cancellation reason is required');
    return this.passes.cancel(command.id, command.version, reason, command.actorId);
  }
}

@CommandHandler(DeleteGatePassCommand)
export class DeleteGatePassHandler
  implements ICommandHandler<DeleteGatePassCommand, { success: true }>
{
  constructor(@Inject(GATE_PASS_REPOSITORY) private readonly passes: GatePassRepository) {}

  async execute(command: DeleteGatePassCommand): Promise<{ success: true }> {
    await this.passes.softDelete(command.id, command.actorId);
    return { success: true };
  }
}

export { buildGatePassData };
