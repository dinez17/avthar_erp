import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import {
  apportionCharge,
  calculatePurchaseLine,
  ConflictError,
  NotFoundError,
  sumPurchaseTotals,
  ValidationError,
} from '@tiles-erp/shared';
import type {
  CreatePurchaseInvoiceInput,
  UpdatePurchaseInvoiceInput,
  Paginated,
  PaginationQuery,
  PurchaseInvoiceItem,
  SupplierRateItem,
  UUID,
} from '@tiles-erp/shared-types';
import {
  PURCHASE_INVOICE_REPOSITORY,
  type InvoiceFilter,
  type InvoiceWriteData,
  type PurchaseInvoiceRepository,
  type ResolvedInvoiceLine,
} from '../domain/purchase-invoice.repository';
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepository,
} from '../domain/purchase-order.repository';

const MAX_LINES = 200;
const round2 = (value: number): number => Math.round(value * 100) / 100;

export class ListPurchaseInvoicesQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: InvoiceFilter,
  ) {}
}

export class GetPurchaseInvoiceQuery {
  constructor(public readonly id: UUID) {}
}

export class SupplierRateHistoryQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: { productId?: UUID; supplierId?: UUID },
  ) {}
}

export class CreatePurchaseInvoiceCommand {
  constructor(
    public readonly data: CreatePurchaseInvoiceInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdatePurchaseInvoiceCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdatePurchaseInvoiceInput,
    public readonly actorId: UUID,
  ) {}
}

export class PostPurchaseInvoiceCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListPurchaseInvoicesQuery)
export class ListPurchaseInvoicesHandler
  implements IQueryHandler<ListPurchaseInvoicesQuery, Paginated<PurchaseInvoiceItem>>
{
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
  ) {}

  execute(query: ListPurchaseInvoicesQuery): Promise<Paginated<PurchaseInvoiceItem>> {
    return this.invoices.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetPurchaseInvoiceQuery)
export class GetPurchaseInvoiceHandler
  implements IQueryHandler<GetPurchaseInvoiceQuery, PurchaseInvoiceItem>
{
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
  ) {}

  async execute(query: GetPurchaseInvoiceQuery): Promise<PurchaseInvoiceItem> {
    const invoice = await this.invoices.findById(query.id);
    if (!invoice) throw new NotFoundError('Purchase invoice not found');
    return invoice;
  }
}

@QueryHandler(SupplierRateHistoryQuery)
export class SupplierRateHistoryHandler
  implements IQueryHandler<SupplierRateHistoryQuery, Paginated<SupplierRateItem>>
{
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
  ) {}

  execute(query: SupplierRateHistoryQuery): Promise<Paginated<SupplierRateItem>> {
    return this.invoices.rateHistory(query.pagination, query.filter);
  }
}

/**
 * Validates and prices an invoice payload, apportioning document charges across the
 * lines. Shared by create and update so both produce identical amounts.
 */
/**
 * Validates and prices an invoice payload, apportioning document charges across the
 * lines. Shared by create and update so both produce identical amounts.
 */
async function buildInvoiceData(
  invoices: PurchaseInvoiceRepository,
  orders: PurchaseOrderRepository,
  data: CreatePurchaseInvoiceInput,
  actorId: UUID,
  options: { excludeInvoiceId?: UUID; invoiceNumber?: string } = {},
): Promise<InvoiceWriteData> {
  if (!data.supplierInvoiceNo?.trim()) {
    throw new ValidationError("The supplier's invoice number is required");
  }
  if (data.lines.length === 0) throw new ValidationError('At least one line is required');
  if (data.lines.length > MAX_LINES) {
    throw new ValidationError(`At most ${MAX_LINES} lines per invoice`);
  }

  await orders.assertReferences(data.supplierId, data.branchId);

  const supplierInvoiceNo = data.supplierInvoiceNo.trim();
  if (
    await invoices.supplierInvoiceExists(data.supplierId, supplierInvoiceNo, options.excludeInvoiceId)
  ) {
    throw new ConflictError(
      `Invoice ${supplierInvoiceNo} has already been entered for this supplier`,
    );
  }

  // A receipt is billed once. Invoicing it twice would count the same goods against the
  // supplier's balance twice over and double the landed cost written back onto the stock,
  // so the picker hides a billed receipt and this refuses one that reaches the API anyway.
  if (data.receiptId) {
    const billed = await invoices.invoiceForReceipt(data.receiptId, options.excludeInvoiceId);
    if (billed) {
      throw new ConflictError(`That goods receipt has already been billed on ${billed}`);
    }
  }

  const transportCharge = data.transportCharge ?? 0;
  const additionalCharge = data.additionalCharge ?? 0;
  if (transportCharge < 0 || additionalCharge < 0) {
    throw new ValidationError('Charges cannot be negative');
  }

  const gstRates = await orders.productGstRates(data.lines.map((l) => l.productId));
  const seen = new Set<string>();

  const priced = data.lines.map((line) => {
    const product = gstRates.get(line.productId);
    if (!product) throw new ValidationError('One or more products no longer exist');
    if (seen.has(line.productId)) {
      throw new ValidationError(`${product.sku} appears more than once; combine those lines`);
    }
    seen.add(line.productId);
    if (line.qtyBoxes <= 0) {
      throw new ValidationError(`${product.sku}: quantity must be greater than zero`);
    }
    if (line.rate < 0) throw new ValidationError(`${product.sku}: rate cannot be negative`);

    const discountPct = line.discountPct ?? 0;
    const gstRate = line.gstRate ?? product.gstRate;
    const amounts = calculatePurchaseLine(line.qtyBoxes, line.rate, discountPct, gstRate);
    return { line, discountPct, gstRate, amounts };
  });

  // Charges are apportioned by line value so landing costs reflect freight fairly.
  const shares = apportionCharge(
    priced.map((p) => p.amounts.lineSubTotal),
    transportCharge + additionalCharge,
  );

  const resolved: ResolvedInvoiceLine[] = priced.map((entry, index) => ({
    productId: entry.line.productId,
    qtyBoxes: entry.line.qtyBoxes,
    rate: entry.line.rate,
    discountPct: entry.discountPct,
    gstRate: entry.gstRate,
    ...entry.amounts,
    impliedLandingCost: round2(
      (entry.amounts.lineTotal + (shares[index] ?? 0)) / entry.line.qtyBoxes,
    ),
  }));

  const totals = sumPurchaseTotals(resolved);
  const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date();

  let dueDate: Date | null = data.dueDate ? new Date(data.dueDate) : null;
  if (!dueDate) {
    const termDays = await invoices.supplierTermDays(data.supplierId);
    if (termDays > 0) {
      dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + termDays);
    }
  }

  return {
    invoiceNumber: options.invoiceNumber ?? (await invoices.nextInvoiceNumber(data.branchId)),
    supplierInvoiceNo,
    supplierId: data.supplierId,
    branchId: data.branchId,
    receiptId: data.receiptId ?? null,
    invoiceDate,
    dueDate,
    transportCharge,
    additionalCharge,
    ...totals,
    remarks: data.remarks ?? null,
    createdBy: actorId,
    lines: resolved,
  };
}

@CommandHandler(CreatePurchaseInvoiceCommand)
export class CreatePurchaseInvoiceHandler
  implements ICommandHandler<CreatePurchaseInvoiceCommand, PurchaseInvoiceItem>
{
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(command: CreatePurchaseInvoiceCommand): Promise<PurchaseInvoiceItem> {
    const data = await buildInvoiceData(this.invoices, this.orders, command.data, command.actorId);
    return this.invoices.create(data);
  }
}

@CommandHandler(UpdatePurchaseInvoiceCommand)
export class UpdatePurchaseInvoiceHandler
  implements ICommandHandler<UpdatePurchaseInvoiceCommand, PurchaseInvoiceItem>
{
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(command: UpdatePurchaseInvoiceCommand): Promise<PurchaseInvoiceItem> {
    const existing = await this.invoices.findById(command.id);
    if (!existing) throw new NotFoundError('Purchase invoice not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError(`Only draft invoices can be edited (this one is ${existing.status})`);
    }

    // Unsupplied fields fall back to what is already on the invoice.
    const merged: CreatePurchaseInvoiceInput = {
      supplierInvoiceNo: command.data.supplierInvoiceNo ?? existing.supplierInvoiceNo,
      supplierId: command.data.supplierId ?? existing.supplierId,
      branchId: command.data.branchId ?? existing.branchId,
      receiptId: command.data.receiptId ?? existing.receiptId,
      invoiceDate: command.data.invoiceDate ?? existing.invoiceDate,
      dueDate: command.data.dueDate ?? existing.dueDate ?? undefined,
      transportCharge: command.data.transportCharge ?? existing.transportCharge,
      additionalCharge: command.data.additionalCharge ?? existing.additionalCharge,
      remarks: command.data.remarks ?? existing.remarks ?? undefined,
      lines:
        command.data.lines ??
        (existing.lines ?? []).map((line) => ({
          productId: line.productId,
          qtyBoxes: line.qtyBoxes,
          rate: line.rate,
          discountPct: line.discountPct,
          gstRate: line.gstRate,
        })),
    };

    const data = await buildInvoiceData(this.invoices, this.orders, merged, command.actorId, {
      excludeInvoiceId: command.id,
      invoiceNumber: existing.invoiceNumber,
    });
    return this.invoices.update(command.id, command.data.version, data, command.actorId);
  }
}

@CommandHandler(PostPurchaseInvoiceCommand)
export class PostPurchaseInvoiceHandler
  implements ICommandHandler<PostPurchaseInvoiceCommand, PurchaseInvoiceItem>
{
  constructor(
    @Inject(PURCHASE_INVOICE_REPOSITORY) private readonly invoices: PurchaseInvoiceRepository,
  ) {}

  execute(command: PostPurchaseInvoiceCommand): Promise<PurchaseInvoiceItem> {
    return this.invoices.post(command.id, command.version, command.actorId);
  }
}
