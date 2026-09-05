import { Inject } from '@nestjs/common';
import { CommandHandler, QueryHandler, type ICommandHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  calculatePurchaseLine,
  checkCredit,
  drawFromSources,
  formatBoxPieces,
  NotFoundError,
  preferHomeBranch,
  ValidationError,
} from '@tiles-erp/shared';
import { guardPrice, type PricingRights } from './price-guard';
import type {
  AvailableStockItem,
  CreateSalesOrderInput,
  Paginated,
  PaginationQuery,
  SalesOrderItem,
  StockReservationItem,
  UpdateSalesOrderInput,
  UUID,
} from '@tiles-erp/shared-types';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
} from '../domain/quotation.repository';
import {
  SALES_ORDER_REPOSITORY,
  type PlannedReservation,
  type ResolvedSalesOrderLine,
  type SalesOrderFilter,
  type SalesOrderRepository,
  type SalesOrderWriteData,
} from '../domain/sales-order.repository';

const MAX_LINES = 200;

/**
 * Rates sanctioned upstream on the quotation.
 *
 * Credit is deliberately **not** waived here. A price was agreed when the quotation was
 * raised; what the customer owes was not, and it may have moved since. Converting is a new
 * commitment and gets a fresh credit check.
 */
const QUOTED_RATES_ALREADY_APPROVED: PricingRights = {
  canOverridePrice: true,
  canSellBelowCost: true,
  canOverrideCredit: false,
};

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export class ListSalesOrdersQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: SalesOrderFilter,
  ) {}
}

export class GetSalesOrderQuery {
  constructor(public readonly id: UUID) {}
}

export class SalesOrderReservationsQuery {
  constructor(public readonly id: UUID) {}
}

export class AvailableStockQuery {
  constructor(
    public readonly branchIds: UUID[],
    public readonly productIds: UUID[],
  ) {}
}

/** The branches a cross-branch order may draw from. */
export class SellableBranchesQuery {}

export class CreateSalesOrderCommand {
  constructor(
    public readonly data: CreateSalesOrderInput,
    public readonly actorId: UUID,
    public readonly rights: PricingRights,
  ) {}
}

export class ConvertQuotationCommand {
  constructor(
    public readonly quotationId: UUID,
    public readonly actorId: UUID,
    public readonly deliveryDate?: string,
    /** Required when the quotation was raised for a walk-in customer. */
    public readonly customerId?: UUID,
  ) {}
}

export class UpdateSalesOrderCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateSalesOrderInput,
    public readonly actorId: UUID,
    public readonly rights: PricingRights,
  ) {}
}

export class ConfirmSalesOrderCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
    /** Allows confirming past the customer's credit limit. */
    public readonly canOverrideCredit: boolean,
    /**
     * Overrides the order's own setting for this confirmation.
     *
     * Confirmation is when the stock is actually reserved, so it is the honest moment to
     * decide whether another branch may supply — and it lets someone who has just hit a
     * shortage turn it on and retry without rebuilding the order.
     */
    public readonly allowCrossBranch?: boolean,
  ) {}
}

export class CancelSalesOrderCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly reason: string,
    public readonly actorId: UUID,
  ) {}
}

export class DeleteSalesOrderCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

/**
 * Prices order lines. Quantities may be entered as boxes plus loose pieces or as a
 * decimal box figure; the branch minimum selling price acts as a floor unless the actor
 * is allowed to override it.
 */
async function buildOrderData(
  orders: SalesOrderRepository,
  quotations: QuotationRepository,
  input: CreateSalesOrderInput & { quotationId?: UUID | null },
  actorId: UUID,
  rights: PricingRights,
): Promise<SalesOrderWriteData> {
  if (input.lines.length === 0) throw new ValidationError('At least one line is required');
  if (input.lines.length > MAX_LINES) {
    throw new ValidationError(`At most ${MAX_LINES} lines per order`);
  }

  await orders.assertBranch(input.branchId);
  const customer = await orders.credit(input.customerId);
  if (!customer.isActive) throw new ValidationError('Customer is inactive');

  // A salesperson always credits their own orders; back-office staff may choose.
  const salesmanUserId = (await orders.isSalesman(actorId))
    ? actorId
    : (input.salesmanUserId ?? null);
  const salesmanName = salesmanUserId ? await orders.salesmanName(salesmanUserId) : null;

  const hints = await quotations.priceHints(
    input.branchId,
    input.lines.map((line) => line.productId),
  );

  const seen = new Set<string>();
  const lines: ResolvedSalesOrderLine[] = input.lines.map((line) => {
    const hint = hints.get(line.productId);
    if (!hint) throw new ValidationError('One or more products no longer exist');
    if (seen.has(line.productId)) {
      throw new ValidationError(`${hint.productName} appears on more than one line`);
    }
    seen.add(line.productId);

    const piecesPerBox = hint.piecesPerBox > 0 ? hint.piecesPerBox : 1;
    const boxes = Math.max(Math.trunc(line.boxes ?? 0), 0);
    const pieces = Math.max(Math.trunc(line.pieces ?? 0), 0);
    const qtyBoxes = round3(line.qtyBoxes ?? boxes + pieces / piecesPerBox);
    if (qtyBoxes <= 0) throw new ValidationError(`${hint.productName} needs a quantity`);

    const rate = line.rate > 0 ? line.rate : (hint.sellingPrice ?? 0);
    if (rate <= 0) throw new ValidationError(`${hint.productName} has no selling price`);

    const discountPct = line.discountPct ?? 0;
    const netRate = round2(rate * (1 - discountPct / 100));
    guardPrice(
      {
        label: hint.productName,
        netRate,
        landingCost: hint.landingCost,
        minSellingPrice: hint.minSellingPrice,
      },
      rights,
    );

    const gstRate = line.gstRate ?? hint.gstRate;
    const amounts = calculatePurchaseLine(qtyBoxes, rate, discountPct, gstRate);

    return {
      productId: line.productId,
      boxes,
      pieces,
      qtyBoxes,
      mrp: line.mrp ?? hint.mrp,
      rate,
      discountPct,
      gstRate,
      lineSubTotal: amounts.lineSubTotal,
      lineGst: amounts.lineGst,
      lineTotal: amounts.lineTotal,
    };
  });

  const subTotal = round2(lines.reduce((sum, line) => sum + line.lineSubTotal, 0));
  const gstAmount = round2(lines.reduce((sum, line) => sum + line.lineGst, 0));

  /*
   * Credit is checked here, when the order is written, not only when it is confirmed.
   *
   * A draft that can never be confirmed is a promise already made to a customer, and
   * finding the limit at confirm time means somebody has to go back and unsay it. What
   * they owe is unpaid invoices plus orders already committed — an order becomes an
   * invoice, so counting both without double-counting is the whole point of the split.
   */
  if (!rights.canOverrideCredit && customer.creditLimit > 0) {
    const orderValue = round2(
      subTotal +
        gstAmount +
        (input.freightCharge ?? 0) +
        (input.unloadingCharge ?? 0) +
        (input.loadingCharge ?? 0) +
        (input.roundOff ?? 0),
    );
    const credit = checkCredit({
      creditLimit: customer.creditLimit,
      creditDays: 0,
      outstanding: round2(customer.outstanding + customer.committedValue),
      oldestOverdueDays: 0,
      overdueAmount: 0,
      documentValue: orderValue,
    });
    if (credit.verdict !== 'OK') {
      throw new ValidationError(`${customer.name} is over their credit limit: ${credit.message}`);
    }
  }
  const freightCharge = input.freightCharge ?? 0;
  const unloadingCharge = input.unloadingCharge ?? 0;
  const loadingCharge = input.loadingCharge ?? 0;
  const roundOff = input.roundOff ?? 0;

  return {
    customerId: input.customerId,
    branchId: input.branchId,
    customerName: customer.name,
    customerAddress: input.customerAddress?.trim() || customer.address,
    customerMobile: input.customerMobile?.trim() || customer.mobile,
    salesmanUserId,
    salesmanName,
    quotationId: input.quotationId ?? null,
    orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
    deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
    remarks: input.remarks?.trim() || null,
    allowCrossBranch: input.allowCrossBranch ?? false,
    subTotal,
    gstAmount,
    freightCharge,
    unloadingCharge,
    loadingCharge,
    roundOff,
    grandTotal: round2(
      subTotal + gstAmount + freightCharge + unloadingCharge + loadingCharge + roundOff,
    ),
    lines,
  };
}

const sourceKey = (entry: AvailableStockItem): string =>
  `${entry.productId}|${entry.branchId}|${entry.godownId}|${entry.batchNo ?? ''}|${entry.shade ?? ''}`;

/**
 * Says where else the stock is, when the home branch cannot cover a line.
 *
 * A refusal that names the branches holding the goods turns a dead end into a decision:
 * transfer it in, or tick cross-branch and let another branch invoice its share.
 */
function elsewhereNote(
  sources: AvailableStockItem[],
  homeBranchId: UUID,
  piecesPerBox: number,
  pieceOnly: boolean,
): string {
  const byBranch = new Map<string, { name: string; qty: number }>();
  for (const source of sources) {
    if (source.branchId === homeBranchId || source.availableQtyBoxes <= 0) continue;
    const held = byBranch.get(source.branchId) ?? { name: source.branchName, qty: 0 };
    held.qty = round3(held.qty + source.availableQtyBoxes);
    byBranch.set(source.branchId, held);
  }
  if (byBranch.size === 0) return '';

  const where = [...byBranch.values()]
    .sort((a, b) => b.qty - a.qty)
    .map((held) => `${held.name} has ${formatBoxPieces(held.qty, piecesPerBox, pieceOnly)}`)
    .join(', ');
  return ` ${where}. Transfer it in, or allow cross-branch supply on this order.`;
}

/**
 * Allocates each ordered line against free stock.
 *
 * The home branch is offered the stock first, then — only when the order allows it —
 * other branches. Within a branch it is oldest batch first, splitting across godowns
 * when no single one holds enough.
 *
 * Preferring home is not an optimisation: selling from the branch that took the order
 * keeps the goods near the customer and raises one invoice instead of two. Another
 * branch is a fallback, however much stock it happens to be sitting on.
 *
 * Throws with the shortfall so the salesperson knows exactly what is missing, and where
 * else it is.
 */
export function planReservations(
  lines: {
    id: UUID;
    productId: UUID;
    productName: string;
    qtyBoxes: number;
    piecesPerBox?: number;
    pieceOnly?: boolean;
  }[],
  available: AvailableStockItem[],
  homeBranchId: UUID,
  allowCrossBranch = false,
): PlannedReservation[] {
  const remainingByKey = new Map(
    available.map((entry) => [sourceKey(entry), entry.availableQtyBoxes]),
  );
  const planned: PlannedReservation[] = [];

  for (const line of lines) {
    const forProduct = available.filter((entry) => entry.productId === line.productId);
    // Ordering carries the whole policy: home first, and within a branch the order the
    // query returned, which is oldest batch first.
    const ordered = preferHomeBranch(forProduct, homeBranchId).filter(
      (entry) => allowCrossBranch || entry.branchId === homeBranchId,
    );

    // Draw against the live remainder, not the snapshot: an earlier line of the same
    // order may already have taken from this godown.
    const sources = ordered.map((entry) => ({
      ...entry,
      availableQtyBoxes: remainingByKey.get(sourceKey(entry)) ?? 0,
    }));

    const { draws, shortfall } = drawFromSources(line.qtyBoxes, sources);

    if (shortfall > 0) {
      const piecesPerBox = line.piecesPerBox ?? 1;
      const pieceOnly = line.pieceOnly ?? false;
      const scope = allowCrossBranch ? 'across every branch' : 'in this branch';
      throw new ValidationError(
        `${line.productName} is short by ${formatBoxPieces(shortfall, piecesPerBox, pieceOnly)} ${scope}.` +
          (allowCrossBranch
            ? ' Reduce the order or bring stock in.'
            : elsewhereNote(forProduct, homeBranchId, piecesPerBox, pieceOnly) ||
              ' Transfer stock in or reduce the order.'),
      );
    }

    for (const draw of draws) {
      const key = sourceKey(draw.source);
      remainingByKey.set(key, round3((remainingByKey.get(key) ?? 0) - draw.qtyBoxes));
      planned.push({
        salesOrderLineId: line.id,
        productId: line.productId,
        branchId: draw.source.branchId,
        godownId: draw.source.godownId,
        gateId: null,
        batchNo: draw.source.batchNo,
        shade: draw.source.shade,
        qtyBoxes: draw.qtyBoxes,
      });
    }
  }

  return planned;
}

@QueryHandler(ListSalesOrdersQuery)
export class ListSalesOrdersHandler
  implements IQueryHandler<ListSalesOrdersQuery, Paginated<SalesOrderItem>>
{
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  execute(query: ListSalesOrdersQuery): Promise<Paginated<SalesOrderItem>> {
    return this.orders.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetSalesOrderQuery)
export class GetSalesOrderHandler implements IQueryHandler<GetSalesOrderQuery, SalesOrderItem> {
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  async execute(query: GetSalesOrderQuery): Promise<SalesOrderItem> {
    const order = await this.orders.findById(query.id);
    if (!order) throw new NotFoundError('Sales order not found');
    return order;
  }
}

@QueryHandler(SalesOrderReservationsQuery)
export class SalesOrderReservationsHandler
  implements IQueryHandler<SalesOrderReservationsQuery, StockReservationItem[]>
{
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  execute(query: SalesOrderReservationsQuery): Promise<StockReservationItem[]> {
    return this.orders.reservations(query.id);
  }
}

@QueryHandler(AvailableStockQuery)
export class AvailableStockHandler
  implements IQueryHandler<AvailableStockQuery, AvailableStockItem[]>
{
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  execute(query: AvailableStockQuery): Promise<AvailableStockItem[]> {
    return this.orders.availableStock(query.branchIds, query.productIds);
  }
}

@QueryHandler(SellableBranchesQuery)
export class SellableBranchesHandler implements IQueryHandler<SellableBranchesQuery, UUID[]> {
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  execute(): Promise<UUID[]> {
    return this.orders.sellableBranchIds();
  }
}

@CommandHandler(CreateSalesOrderCommand)
export class CreateSalesOrderHandler
  implements ICommandHandler<CreateSalesOrderCommand, SalesOrderItem>
{
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
  ) {}

  async execute(command: CreateSalesOrderCommand): Promise<SalesOrderItem> {
    const data = await buildOrderData(
      this.orders,
      this.quotations,
      command.data,
      command.actorId,
      command.rights,
    );
    const number = await this.orders.nextOrderNumber(data.branchId);
    return this.orders.create(number, data, command.actorId);
  }
}

@CommandHandler(ConvertQuotationCommand)
export class ConvertQuotationHandler
  implements ICommandHandler<ConvertQuotationCommand, SalesOrderItem>
{
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
  ) {}

  async execute(command: ConvertQuotationCommand): Promise<SalesOrderItem> {
    const quotation = await this.quotations.findById(command.quotationId);
    if (!quotation) throw new NotFoundError('Quotation not found');
    if (quotation.status !== 'ACCEPTED') {
      throw new ValidationError(
        `Only accepted quotations can be converted (this one is ${quotation.status})`,
      );
    }
    // Accepting a walk-in quote registers the customer, so by here one is normally
    // attached. This stays as a safety net for a quote accepted before that behaviour
    // existed, and lets the counter name a different account if it wants to.
    const customerId = quotation.customerId ?? command.customerId;
    if (!customerId) {
      throw new ValidationError(
        'This quotation has no customer on it. Choose the customer to order for.',
      );
    }

    const data = await buildOrderData(
      this.orders,
      this.quotations,
      {
        customerId,
        branchId: quotation.branchId,
        customerAddress: quotation.customerAddress ?? undefined,
        customerMobile: quotation.customerMobile ?? undefined,
        salesmanUserId: quotation.salesmanUserId,
        deliveryDate: command.deliveryDate,
        freightCharge: quotation.freightCharge,
        unloadingCharge: quotation.unloadingCharge,
        loadingCharge: quotation.loadingCharge,
        roundOff: quotation.roundOff,
        remarks: quotation.remarks ?? undefined,
        quotationId: quotation.id,
        lines: (quotation.lines ?? []).map((line) => ({
          productId: line.productId,
          boxes: line.boxes,
          pieces: line.pieces,
          qtyBoxes: line.qtyBoxes,
          mrp: line.mrp ?? undefined,
          rate: line.rate,
          discountPct: line.discountPct,
          gstRate: line.gstRate,
        })),
      },
      command.actorId,
      // Rates carry over from the quotation unchecked, because they were already checked
      // there — a price below the floor could only have got onto the quotation if someone
      // with the permission put it there. Re-running the guard here would block the
      // conversion for whoever happens to be doing the paperwork, which is not the person
      // the decision was ever theirs to make.
      QUOTED_RATES_ALREADY_APPROVED,
    );

    const number = await this.orders.nextOrderNumber(data.branchId);
    return this.orders.create(number, data, command.actorId);
  }
}

@CommandHandler(UpdateSalesOrderCommand)
export class UpdateSalesOrderHandler
  implements ICommandHandler<UpdateSalesOrderCommand, SalesOrderItem>
{
  constructor(
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
  ) {}

  async execute(command: UpdateSalesOrderCommand): Promise<SalesOrderItem> {
    const existing = await this.orders.findById(command.id);
    if (!existing) throw new NotFoundError('Sales order not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError(
        `Only draft orders can be edited (this one is ${existing.status})`,
      );
    }

    const merged: CreateSalesOrderInput & { quotationId: UUID | null } = {
      customerId: command.data.customerId ?? existing.customerId,
      branchId: command.data.branchId ?? existing.branchId,
      customerAddress: command.data.customerAddress ?? existing.customerAddress ?? undefined,
      customerMobile: command.data.customerMobile ?? existing.customerMobile ?? undefined,
      salesmanUserId: command.data.salesmanUserId ?? existing.salesmanUserId,
      orderDate: command.data.orderDate ?? existing.orderDate,
      deliveryDate: command.data.deliveryDate ?? existing.deliveryDate ?? undefined,
      freightCharge: command.data.freightCharge ?? existing.freightCharge,
      unloadingCharge: command.data.unloadingCharge ?? existing.unloadingCharge,
      loadingCharge: command.data.loadingCharge ?? existing.loadingCharge,
      roundOff: command.data.roundOff ?? existing.roundOff,
      remarks: command.data.remarks ?? existing.remarks ?? undefined,
      quotationId: existing.quotationId,
      lines:
        command.data.lines ??
        (existing.lines ?? []).map((line) => ({
          productId: line.productId,
          boxes: line.boxes,
          pieces: line.pieces,
          qtyBoxes: line.qtyBoxes,
          mrp: line.mrp ?? undefined,
          rate: line.rate,
          discountPct: line.discountPct,
          gstRate: line.gstRate,
        })),
    };

    const data = await buildOrderData(
      this.orders,
      this.quotations,
      merged,
      command.actorId,
      command.rights,
    );
    return this.orders.update(command.id, command.data.version, data, command.actorId);
  }
}

@CommandHandler(ConfirmSalesOrderCommand)
export class ConfirmSalesOrderHandler
  implements ICommandHandler<ConfirmSalesOrderCommand, SalesOrderItem>
{
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  async execute(command: ConfirmSalesOrderCommand): Promise<SalesOrderItem> {
    const order = await this.orders.findById(command.id);
    if (!order) throw new NotFoundError('Sales order not found');
    if (order.status !== 'DRAFT') {
      throw new ValidationError(
        `Only draft orders can be confirmed (this one is ${order.status})`,
      );
    }
    const lines = order.lines ?? [];
    if (lines.length === 0) throw new ValidationError('This order has no lines');

    // Credit control: what is already committed plus this order must fit the limit.
    const credit = await this.orders.credit(order.customerId);
    if (!command.canOverrideCredit && credit.creditLimit > 0) {
      const exposure = round2(credit.committedValue + order.grandTotal);
      if (exposure > credit.creditLimit) {
        throw new ValidationError(
          `Credit limit exceeded: ${exposure} against a limit of ${credit.creditLimit}. An approver must confirm this order.`,
        );
      }
    }

    const allowCrossBranch = command.allowCrossBranch ?? order.allowCrossBranch;

    // Look wider only when the order allows it, so an ordinary order cannot quietly
    // reserve stock a branch was holding for its own customers.
    const searchBranchIds = allowCrossBranch
      ? await this.orders.sellableBranchIds()
      : [order.branchId];

    const available = await this.orders.availableStock(
      searchBranchIds,
      lines.map((line) => line.productId),
    );
    const reservations = planReservations(
      lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        productName: line.productName,
        qtyBoxes: line.qtyBoxes,
        piecesPerBox: line.piecesPerBox,
        pieceOnly: line.baseUom === 'PIECE',
      })),
      available,
      order.branchId,
      allowCrossBranch,
    );

    return this.orders.confirm(
      command.id,
      command.version,
      reservations,
      command.actorId,
      allowCrossBranch,
    );
  }
}

@CommandHandler(CancelSalesOrderCommand)
export class CancelSalesOrderHandler
  implements ICommandHandler<CancelSalesOrderCommand, SalesOrderItem>
{
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  execute(command: CancelSalesOrderCommand): Promise<SalesOrderItem> {
    const reason = command.reason.trim();
    if (!reason) throw new ValidationError('A cancellation reason is required');
    return this.orders.cancel(command.id, command.version, reason, command.actorId);
  }
}

@CommandHandler(DeleteSalesOrderCommand)
export class DeleteSalesOrderHandler
  implements ICommandHandler<DeleteSalesOrderCommand, { success: true }>
{
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  async execute(command: DeleteSalesOrderCommand): Promise<{ success: true }> {
    await this.orders.softDelete(command.id, command.actorId);
    return { success: true };
  }
}
