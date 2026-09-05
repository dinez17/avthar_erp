import { Inject } from '@nestjs/common';
import { CommandHandler, QueryHandler, type ICommandHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  calculatePurchaseLine,
  checkCredit,
  formatBoxPieces,
  isInterStateSupply,
  NotFoundError,
  splitGst,
  ValidationError,
} from '@tiles-erp/shared';
import { guardPrice, type PricingRights } from './price-guard';
import type {
  CreateSalesInvoiceInput,
  InvoiceableLine,
  OrderSplitPlan,
  Paginated,
  PaginationQuery,
  SalesInvoiceItem,
  SalesInvoiceLineInput,
  SalesInvoicePrintData,
  SplitInvoiceInput,
  SplitInvoiceResult,
  UpdateSalesInvoiceInput,
  UUID,
} from '@tiles-erp/shared-types';
import {
  SALES_INVOICE_REPOSITORY,
  type ResolvedSalesInvoiceLine,
  type SalesInvoiceFilter,
  type SalesInvoiceRepository,
  type SalesInvoiceWriteData,
} from '../domain/sales-invoice.repository';
import {
  SALES_ORDER_REPOSITORY,
  type SalesOrderRepository,
} from '../domain/sales-order.repository';

const MAX_LINES = 200;

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export class ListSalesInvoicesQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: SalesInvoiceFilter,
  ) {}
}

export class GetSalesInvoiceQuery {
  constructor(public readonly id: UUID) {}
}

export class SalesInvoicePrintQuery {
  constructor(public readonly id: UUID) {}
}

export class InvoiceableLinesQuery {
  constructor(public readonly salesOrderId: UUID) {}
}

export class CreateSalesInvoiceCommand {
  constructor(
    public readonly data: CreateSalesInvoiceInput,
    public readonly actorId: UUID,
    public readonly rights: PricingRights,
  ) {}
}

export class UpdateSalesInvoiceCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateSalesInvoiceInput,
    public readonly actorId: UUID,
    public readonly rights: PricingRights,
  ) {}
}

export class PostSalesInvoiceCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
    /** Allows posting past the customer's credit limit. */
    public readonly canOverrideCredit: boolean,
  ) {}
}

export class CancelSalesInvoiceCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly reason: string,
    public readonly actorId: UUID,
  ) {}
}

export class SplitSalesOrderCommand {
  constructor(
    public readonly data: SplitInvoiceInput,
    public readonly actorId: UUID,
    public readonly rights: PricingRights,
  ) {}
}

export class OrderSplitPlanQuery {
  constructor(public readonly salesOrderId: UUID) {}
}

export class DeleteSalesInvoiceCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

/**
 * Prices invoice lines and splits the tax by place of supply. Quantities may be entered
 * as boxes plus loose pieces; each line names the godown the goods leave from, because
 * posting has to know which balance to reduce.
 */
async function buildInvoiceData(
  invoices: SalesInvoiceRepository,
  input: CreateSalesInvoiceInput,
  actorId: UUID,
  rights: PricingRights,
  /** The draft being edited, so it does not count itself as a rival claim. */
  exceptInvoiceId?: UUID,
): Promise<SalesInvoiceWriteData> {
  if (input.lines.length === 0) throw new ValidationError('At least one line is required');
  if (input.lines.length > MAX_LINES) {
    throw new ValidationError(`At most ${MAX_LINES} lines per invoice`);
  }

  const parties = await invoices.billingParties(input.customerId, input.branchId);
  if (!parties.customerIsActive) throw new ValidationError('Customer is inactive');

  // Caught here rather than at posting: a line shipping from another branch's godown is
  // wrong the moment it is typed, and the failure at post time is unreadable.
  await invoices.assertGodownsInBranch(
    input.branchId,
    input.lines.map((line) => line.godownId),
  );

  const interState = isInterStateSupply(parties.branchStateCode, parties.customerStateCode);

  // Cost and the branch floor for everything on this invoice.
  //
  // An invoice can be raised without an order — a counter sale — and that path enforced no
  // price rule whatsoever, which made it the obvious way past a floor the other two
  // documents applied. Discounts are given at the counter more than anywhere else.
  const hints = await invoices.priceHints(
    input.branchId,
    input.lines.map((line) => line.productId),
  );

  // An order tells us the agreed rates and what is still owed on each line.
  const pending = input.salesOrderId
    ? new Map(
        (await invoices.invoiceableLines(input.salesOrderId, exceptInvoiceId)).map((line) => [
          line.salesOrderLineId,
          line,
        ]),
      )
    : new Map<UUID, InvoiceableLine>();

  const drawnByOrderLine = new Map<UUID, number>();

  const lines: ResolvedSalesInvoiceLine[] = input.lines.map((line) => {
    const source = line.salesOrderLineId ? pending.get(line.salesOrderLineId) : undefined;
    if (line.salesOrderLineId && !source) {
      throw new ValidationError('One or more lines do not belong to that order');
    }

    const piecesPerBox = source && source.piecesPerBox > 0 ? source.piecesPerBox : 1;
    const boxes = Math.max(Math.trunc(line.boxes ?? 0), 0);
    const pieces = Math.max(Math.trunc(line.pieces ?? 0), 0);
    const qtyBoxes = round3(line.qtyBoxes ?? boxes + pieces / piecesPerBox);
    if (qtyBoxes <= 0) {
      throw new ValidationError(`${source?.productName ?? 'A line'} needs a quantity`);
    }

    // Never invoice more than the order still owes, across all lines of this invoice.
    if (source) {
      const drawn = round3((drawnByOrderLine.get(source.salesOrderLineId) ?? 0) + qtyBoxes);
      if (drawn > source.pendingQtyBoxes + 0.0005) {
        // Naming the draft that took it saves a hunt through the invoice list.
        const heldByDraft =
          source.draftedQtyBoxes > 0
            ? ` (${formatBoxPieces(
                source.draftedQtyBoxes,
                source.piecesPerBox,
                source.baseUom === 'PIECE',
              )} is already on an unposted draft)`
            : '';
        throw new ValidationError(
          `${source.productName}: only ${formatBoxPieces(
            source.pendingQtyBoxes,
            source.piecesPerBox,
            source.baseUom === 'PIECE',
          )} left to invoice on this order${heldByDraft}`,
        );
      }
      drawnByOrderLine.set(source.salesOrderLineId, drawn);
    }

    const rate = line.rate > 0 ? line.rate : (source?.rate ?? 0);
    if (rate <= 0) throw new ValidationError(`${source?.productName ?? 'A line'} needs a rate`);

    const discountPct = line.discountPct ?? source?.discountPct ?? 0;

    // The floor applies to what the customer actually pays. A discount comes out of
    // margin and nowhere else.
    const hint = hints.get(line.productId);
    if (hint) {
      guardPrice(
        {
          label: hint.sku,
          netRate: round2(rate * (1 - discountPct / 100)),
          landingCost: hint.landingCost,
          minSellingPrice: hint.minSellingPrice,
        },
        rights,
      );
    }

    const gstRate = line.gstRate ?? source?.gstRate ?? 0;
    const amounts = calculatePurchaseLine(qtyBoxes, rate, discountPct, gstRate);
    const tax = splitGst(amounts.lineGst, interState);

    return {
      productId: line.productId,
      salesOrderLineId: line.salesOrderLineId ?? null,
      godownId: line.godownId,
      gateId: null,
      batchNo: line.batchNo ?? null,
      shade: line.shade ?? null,
      hsnCode: source?.hsnCode ?? null,
      boxes,
      pieces,
      qtyBoxes,
      mrp: line.mrp ?? source?.mrp ?? null,
      rate,
      discountPct,
      gstRate,
      lineSubTotal: amounts.lineSubTotal,
      lineCgst: tax.cgst,
      lineSgst: tax.sgst,
      lineIgst: tax.igst,
      lineGst: amounts.lineGst,
      lineTotal: amounts.lineTotal,
    };
  });

  const subTotal = round2(lines.reduce((sum, line) => sum + line.lineSubTotal, 0));

  /*
   * Credit is checked as the invoice is written, not only at posting.
   *
   * Posting is far too late: the goods have been picked and the customer has been told a
   * number. The same check runs again at posting because the outstanding moves in between.
   */
  if (!rights.canOverrideCredit && parties.creditLimit > 0) {
    const gross = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const credit = checkCredit({
      creditLimit: parties.creditLimit,
      creditDays: 0,
      outstanding: parties.outstanding,
      oldestOverdueDays: 0,
      overdueAmount: 0,
      documentValue: gross,
    });
    if (credit.verdict !== 'OK') {
      throw new ValidationError(
        `${parties.customerName ?? 'This customer'} is over their credit limit: ${credit.message}`,
      );
    }
  }
  const cgstAmount = round2(lines.reduce((sum, line) => sum + line.lineCgst, 0));
  const sgstAmount = round2(lines.reduce((sum, line) => sum + line.lineSgst, 0));
  const igstAmount = round2(lines.reduce((sum, line) => sum + line.lineIgst, 0));
  const gstAmount = round2(cgstAmount + sgstAmount + igstAmount);
  const freightCharge = input.freightCharge ?? 0;
  const unloadingCharge = input.unloadingCharge ?? 0;
  const loadingCharge = input.loadingCharge ?? 0;
  const roundOff = input.roundOff ?? 0;

  // Credit days set the due date unless the counter overrides it.
  const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : new Date();
  let dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (!dueDate && parties.creditDays > 0) {
    dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + parties.creditDays);
  }

  const salesmanName = await invoices.salesmanName(actorId);

  return {
    customerId: input.customerId,
    branchId: input.branchId,
    salesOrderId: input.salesOrderId ?? null,
    customerName: parties.customerName,
    customerAddress: input.customerAddress?.trim() || parties.customerAddress,
    customerMobile: input.customerMobile?.trim() || parties.customerMobile,
    customerGstin: parties.customerGstin,
    placeOfSupply: parties.customerStateCode ?? parties.branchStateCode,
    salesmanUserId: actorId,
    salesmanName,
    invoiceDate,
    dueDate,
    remarks: input.remarks?.trim() || null,
    subTotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
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

@QueryHandler(ListSalesInvoicesQuery)
export class ListSalesInvoicesHandler
  implements IQueryHandler<ListSalesInvoicesQuery, Paginated<SalesInvoiceItem>>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  execute(query: ListSalesInvoicesQuery): Promise<Paginated<SalesInvoiceItem>> {
    return this.invoices.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetSalesInvoiceQuery)
export class GetSalesInvoiceHandler
  implements IQueryHandler<GetSalesInvoiceQuery, SalesInvoiceItem>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  async execute(query: GetSalesInvoiceQuery): Promise<SalesInvoiceItem> {
    const invoice = await this.invoices.findById(query.id);
    if (!invoice) throw new NotFoundError('Sales invoice not found');
    return invoice;
  }
}

@QueryHandler(InvoiceableLinesQuery)
export class InvoiceableLinesHandler
  implements IQueryHandler<InvoiceableLinesQuery, InvoiceableLine[]>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  execute(query: InvoiceableLinesQuery): Promise<InvoiceableLine[]> {
    return this.invoices.invoiceableLines(query.salesOrderId);
  }
}

@CommandHandler(CreateSalesInvoiceCommand)
export class CreateSalesInvoiceHandler
  implements ICommandHandler<CreateSalesInvoiceCommand, SalesInvoiceItem>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  async execute(command: CreateSalesInvoiceCommand): Promise<SalesInvoiceItem> {
    const data = await buildInvoiceData(
      this.invoices,
      command.data,
      command.actorId,
      command.rights,
    );
    const number = await this.invoices.nextInvoiceNumber(data.branchId);
    return this.invoices.create(number, data, command.actorId);
  }
}

/**
 * Cuts one draft invoice per supplying branch on a confirmed order.
 *
 * The split is not a new pricing path: each branch's invoice is built through the same
 * `create` the counter uses, with the lines drawn from that branch's reservations. What
 * changes is the invoice's own branch — and that is what makes the tax come out right,
 * because the GST split is decided by the supplying branch's state against the
 * customer's. One order can therefore carry CGST+SGST on one invoice and IGST on
 * another, which is correct: two branches under two registrations made two supplies.
 *
 * Branches already invoiced are skipped rather than refused, so running the split again
 * after adding stock picks up only what is new.
 */
@CommandHandler(SplitSalesOrderCommand)
export class SplitSalesOrderHandler
  implements ICommandHandler<SplitSalesOrderCommand, SplitInvoiceResult>
{
  constructor(
    @Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository,
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
  ) {}

  async execute(command: SplitSalesOrderCommand): Promise<SplitInvoiceResult> {
    const { salesOrderId } = command.data;
    const order = await this.orders.findById(salesOrderId);
    if (!order) throw new NotFoundError('Sales order not found');
    if (order.status === 'CANCELLED') throw new ValidationError('This order is cancelled');
    if (order.status === 'DRAFT') {
      throw new ValidationError('Confirm the order before invoicing it');
    }

    const plan = await this.orders.splitPlan(salesOrderId);
    if (plan.rows.length === 0) {
      throw new ValidationError('Nothing is reserved against this order to invoice');
    }

    const wanted = command.data.branchIds?.length ? new Set(command.data.branchIds) : null;
    const pending = await this.invoices.invoiceableLines(salesOrderId);

    const invoices: SplitInvoiceResult['invoices'] = [];
    const skipped: SplitInvoiceResult['skipped'] = [];

    for (const row of plan.rows) {
      if (wanted && !wanted.has(row.branchId)) continue;
      if (row.invoiceId) {
        skipped.push({
          branchId: row.branchId,
          branchName: row.branchName,
          reason: `Already invoiced as ${row.invoiceNumber}`,
        });
        continue;
      }

      // One line per order line and stock key, taking only what this branch holds and
      // only up to what the order still owes.
      const lines: SalesInvoiceLineInput[] = [];
      for (const line of pending) {
        let remaining = line.pendingQtyBoxes;
        if (remaining <= 0) continue;
        for (const source of line.sources) {
          if (source.branchId !== row.branchId) continue;
          if (remaining <= 0) break;
          const qtyBoxes = round3(Math.min(source.qtyBoxes, remaining));
          if (qtyBoxes <= 0) continue;
          remaining = round3(remaining - qtyBoxes);
          lines.push({
            productId: line.productId,
            salesOrderLineId: line.salesOrderLineId,
            godownId: source.godownId,
            batchNo: source.batchNo,
            shade: source.shade,
            qtyBoxes,
            rate: line.rate,
            discountPct: line.discountPct,
            gstRate: line.gstRate,
            mrp: line.mrp ?? undefined,
          });
        }
      }

      if (lines.length === 0) {
        skipped.push({
          branchId: row.branchId,
          branchName: row.branchName,
          reason: 'Nothing left to invoice from this branch',
        });
        continue;
      }

      const data = await buildInvoiceData(
        this.invoices,
        {
          customerId: order.customerId,
          branchId: row.branchId,
          salesOrderId,
          invoiceDate: command.data.invoiceDate,
          lines,
        },
        command.actorId,
        command.rights,
      );
      const number = await this.invoices.nextInvoiceNumber(data.branchId);
      const created = await this.invoices.create(number, data, command.actorId);
      invoices.push({
        invoiceId: created.id,
        invoiceNumber: created.invoiceNumber,
        branchId: row.branchId,
        branchName: row.branchName,
      });
    }

    if (invoices.length === 0 && skipped.length > 0) {
      throw new ValidationError(
        skipped.map((entry) => `${entry.branchName}: ${entry.reason}`).join('. '),
      );
    }

    return { salesOrderId, invoices, skipped };
  }
}

@QueryHandler(OrderSplitPlanQuery)
export class OrderSplitPlanHandler implements IQueryHandler<OrderSplitPlanQuery, OrderSplitPlan> {
  constructor(@Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository) {}

  execute(query: OrderSplitPlanQuery): Promise<OrderSplitPlan> {
    return this.orders.splitPlan(query.salesOrderId);
  }
}

@CommandHandler(UpdateSalesInvoiceCommand)
export class UpdateSalesInvoiceHandler
  implements ICommandHandler<UpdateSalesInvoiceCommand, SalesInvoiceItem>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  async execute(command: UpdateSalesInvoiceCommand): Promise<SalesInvoiceItem> {
    const existing = await this.invoices.findById(command.id);
    if (!existing) throw new NotFoundError('Sales invoice not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError(
        `Only draft invoices can be edited (this one is ${existing.status})`,
      );
    }

    const merged: CreateSalesInvoiceInput = {
      customerId: command.data.customerId ?? existing.customerId,
      branchId: command.data.branchId ?? existing.branchId,
      salesOrderId: existing.salesOrderId,
      customerAddress: command.data.customerAddress ?? existing.customerAddress ?? undefined,
      customerMobile: command.data.customerMobile ?? existing.customerMobile ?? undefined,
      invoiceDate: command.data.invoiceDate ?? existing.invoiceDate,
      dueDate: command.data.dueDate ?? existing.dueDate ?? undefined,
      freightCharge: command.data.freightCharge ?? existing.freightCharge,
      unloadingCharge: command.data.unloadingCharge ?? existing.unloadingCharge,
      loadingCharge: command.data.loadingCharge ?? existing.loadingCharge,
      roundOff: command.data.roundOff ?? existing.roundOff,
      remarks: command.data.remarks ?? existing.remarks ?? undefined,
      lines:
        command.data.lines ??
        (existing.lines ?? []).map((line) => ({
          productId: line.productId,
          salesOrderLineId: line.salesOrderLineId ?? undefined,
          godownId: line.godownId,
          batchNo: line.batchNo,
          shade: line.shade,
          boxes: line.boxes,
          pieces: line.pieces,
          qtyBoxes: line.qtyBoxes,
          mrp: line.mrp ?? undefined,
          rate: line.rate,
          discountPct: line.discountPct,
          gstRate: line.gstRate,
        })),
    };

    const data = await buildInvoiceData(
      this.invoices,
      merged,
      command.actorId,
      command.rights,
      command.id,
    );
    return this.invoices.update(command.id, command.data.version, data, command.actorId);
  }
}

@CommandHandler(PostSalesInvoiceCommand)
export class PostSalesInvoiceHandler
  implements ICommandHandler<PostSalesInvoiceCommand, SalesInvoiceItem>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  async execute(command: PostSalesInvoiceCommand): Promise<SalesInvoiceItem> {
    const invoice = await this.invoices.findById(command.id);
    if (!invoice) throw new NotFoundError('Sales invoice not found');
    if (invoice.status !== 'DRAFT') {
      throw new ValidationError(`Only draft invoices can be posted (this one is ${invoice.status})`);
    }

    // Credit control again at posting: the outstanding may have moved since the order.
    const parties = await this.invoices.billingParties(invoice.customerId, invoice.branchId);
    if (!command.canOverrideCredit && parties.creditLimit > 0) {
      const exposure = round2(parties.outstanding + invoice.grandTotal);
      if (exposure > parties.creditLimit) {
        throw new ValidationError(
          `Credit limit exceeded: ${exposure} against a limit of ${parties.creditLimit}. An approver must post this invoice.`,
        );
      }
    }

    return this.invoices.post(command.id, command.version, command.actorId);
  }
}

@CommandHandler(CancelSalesInvoiceCommand)
export class CancelSalesInvoiceHandler
  implements ICommandHandler<CancelSalesInvoiceCommand, SalesInvoiceItem>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  execute(command: CancelSalesInvoiceCommand): Promise<SalesInvoiceItem> {
    const reason = command.reason.trim();
    if (!reason) throw new ValidationError('A cancellation reason is required');
    return this.invoices.cancel(command.id, command.version, reason, command.actorId);
  }
}

@CommandHandler(DeleteSalesInvoiceCommand)
export class DeleteSalesInvoiceHandler
  implements ICommandHandler<DeleteSalesInvoiceCommand, { success: true }>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  async execute(command: DeleteSalesInvoiceCommand): Promise<{ success: true }> {
    await this.invoices.softDelete(command.id, command.actorId);
    return { success: true };
  }
}

@QueryHandler(SalesInvoicePrintQuery)
export class SalesInvoicePrintHandler
  implements IQueryHandler<SalesInvoicePrintQuery, SalesInvoicePrintData>
{
  constructor(@Inject(SALES_INVOICE_REPOSITORY) private readonly invoices: SalesInvoiceRepository) {}

  async execute(query: SalesInvoicePrintQuery): Promise<SalesInvoicePrintData> {
    const data = await this.invoices.printData(query.id);
    if (!data) throw new NotFoundError('Sales invoice not found');
    return data;
  }
}
