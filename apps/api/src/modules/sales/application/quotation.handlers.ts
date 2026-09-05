import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import {
  calculatePurchaseLine,
  NotFoundError,
  sumPurchaseTotals,
  ValidationError,
} from '@tiles-erp/shared';
import { guardPrice, type PricingRights } from './price-guard';
import type {
  AvailableStockItem,
  CreateQuotationInput,
  Paginated,
  PaginationQuery,
  ProductPriceHint,
  QuotationItem,
  QuotationPrintData,
  QuotationStatus,
  UUID,
  UpdateQuotationInput,
} from '@tiles-erp/shared-types';
import {
  QUOTATION_REPOSITORY,
  type QuotationFilter,
  type QuotationRepository,
  type QuotationWriteData,
  type ResolvedQuotationLine,
} from '../domain/quotation.repository';
import { walkInRegistration } from './walk-in';

const MAX_LINES = 200;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export class ListQuotationsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: QuotationFilter,
  ) {}
}

export class QuotationStockQuery {
  constructor(
    public readonly branchId: UUID,
    public readonly productIds: UUID[],
  ) {}
}

export class QuotationPrintQuery {
  constructor(public readonly id: UUID) {}
}

export class GetQuotationQuery {
  constructor(public readonly id: UUID) {}
}

export class ProductPriceHintsQuery {
  constructor(
    public readonly branchId: UUID,
    public readonly productIds: UUID[],
  ) {}
}

export class CreateQuotationCommand {
  constructor(
    public readonly data: CreateQuotationInput,
    public readonly actorId: UUID,
    /** Whether the actor may quote below the minimum selling price. */
    public readonly rights: PricingRights,
  ) {}
}

export class UpdateQuotationCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateQuotationInput,
    public readonly actorId: UUID,
    public readonly rights: PricingRights,
  ) {}
}

export class ChangeQuotationStatusCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly status: Extract<QuotationStatus, 'SENT' | 'ACCEPTED' | 'REJECTED'>,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListQuotationsQuery)
export class ListQuotationsHandler
  implements IQueryHandler<ListQuotationsQuery, Paginated<QuotationItem>>
{
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  execute(query: ListQuotationsQuery): Promise<Paginated<QuotationItem>> {
    return this.quotations.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetQuotationQuery)
export class GetQuotationHandler implements IQueryHandler<GetQuotationQuery, QuotationItem> {
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async execute(query: GetQuotationQuery): Promise<QuotationItem> {
    const quotation = await this.quotations.findById(query.id);
    if (!quotation) throw new NotFoundError('Quotation not found');
    return quotation;
  }
}

@QueryHandler(ProductPriceHintsQuery)
export class ProductPriceHintsHandler
  implements IQueryHandler<ProductPriceHintsQuery, ProductPriceHint[]>
{
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async execute(query: ProductPriceHintsQuery): Promise<ProductPriceHint[]> {
    const hints = await this.quotations.priceHints(query.branchId, query.productIds);
    return [...hints.values()];
  }
}

/**
 * Validates and prices quotation lines. Quantities may be entered as boxes plus loose
 * pieces (counter style) or as a decimal box figure. Rates default to the branch
 * selling price, and the branch minimum acts as a floor unless the actor may override.
 */
async function buildQuotationData(
  quotations: QuotationRepository,
  input: CreateQuotationInput,
  rights: PricingRights,
): Promise<QuotationWriteData> {
  if (input.lines.length === 0) throw new ValidationError('At least one line is required');
  if (input.lines.length > MAX_LINES) {
    throw new ValidationError(`At most ${MAX_LINES} lines per quotation`);
  }

  await quotations.assertReferences(input.customerId ?? null, input.branchId);

  // A linked customer supplies the snapshot; a walk-in must be named explicitly.
  let customerName = input.customerName?.trim() ?? '';
  let customerAddress = input.customerAddress?.trim() || null;
  let customerMobile = input.customerMobile?.trim() || null;
  if (input.customerId) {
    const snapshot = await quotations.customerSnapshot(input.customerId);
    customerName = customerName || snapshot.name;
    customerAddress = customerAddress ?? snapshot.address;
    customerMobile = customerMobile ?? snapshot.mobile;
  }
  if (!customerName) throw new ValidationError('A customer name is required');

  // The credited salesperson is stored by id, with a name snapshot for printing.
  const salesmanUserId = input.salesmanUserId ?? null;
  const salesmanName = salesmanUserId
    ? ((await quotations.salesmanName(salesmanUserId)) ?? input.salesmanName?.trim() ?? null)
    : (input.salesmanName?.trim() || null);

  const hints = await quotations.priceHints(
    input.branchId,
    input.lines.map((l) => l.productId),
  );

  const seen = new Set<string>();
  const resolved: ResolvedQuotationLine[] = input.lines.map((line) => {
    const hint = hints.get(line.productId);
    if (!hint) throw new ValidationError('One or more products no longer exist');
    if (seen.has(line.productId)) {
      throw new ValidationError(`${hint.sku} appears more than once; combine those lines`);
    }
    seen.add(line.productId);

    const boxes = line.boxes ?? 0;
    const pieces = line.pieces ?? 0;
    if (boxes < 0 || pieces < 0) {
      throw new ValidationError(`${hint.sku}: quantities cannot be negative`);
    }
    const qtyBoxes =
      line.qtyBoxes ??
      round3(boxes + (pieces > 0 && hint.piecesPerBox > 0 ? pieces / hint.piecesPerBox : 0));
    if (qtyBoxes <= 0) {
      throw new ValidationError(`${hint.sku}: quantity must be greater than zero`);
    }

    const rate = line.rate > 0 ? line.rate : (hint.sellingPrice ?? 0);
    if (rate <= 0) {
      throw new ValidationError(
        `${hint.sku}: no selling price is set for this branch, enter a rate`,
      );
    }

    const discountPct = line.discountPct ?? 0;
    if (discountPct < 0 || discountPct > 100) {
      throw new ValidationError(`${hint.sku}: discount must be between 0 and 100`);
    }

    // The floor applies to what the customer actually pays, after discount — a discount
    // comes out of margin and nowhere else.
    const netRate = round2(rate * (1 - discountPct / 100));
    guardPrice(
      {
        label: hint.sku,
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
      mrp: line.mrp ?? hint.mrp ?? null,
      rate,
      discountPct,
      gstRate,
      ...amounts,
    };
  });

  const totals = sumPurchaseTotals(resolved);
  const freightCharge = input.freightCharge ?? 0;
  const unloadingCharge = input.unloadingCharge ?? 0;
  const loadingCharge = input.loadingCharge ?? 0;
  const roundOff = input.roundOff ?? 0;
  if (freightCharge < 0 || unloadingCharge < 0 || loadingCharge < 0) {
    throw new ValidationError('Charges cannot be negative');
  }

  // Charges sit outside the taxable value, matching counter practice.
  const grandTotal = round2(
    totals.grandTotal + freightCharge + unloadingCharge + loadingCharge + roundOff,
  );

  return {
    customerId: input.customerId ?? null,
    customerName,
    customerAddress,
    customerMobile,
    salesmanUserId,
    salesmanName,
    branchId: input.branchId,
    quotationDate: input.quotationDate ? new Date(input.quotationDate) : new Date(),
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
    remarks: input.remarks ?? null,
    subTotal: totals.subTotal,
    gstAmount: totals.gstAmount,
    freightCharge,
    unloadingCharge,
    loadingCharge,
    roundOff,
    grandTotal,
    lines: resolved,
  };
}

/**
 * A user who is themselves a salesperson always credits their own quotations; only
 * back-office staff may pick which salesperson a quotation belongs to.
 */
async function resolveSalesmanUserId(
  quotations: QuotationRepository,
  actorId: UUID,
  requested: UUID | null | undefined,
): Promise<UUID | null> {
  if (await quotations.isSalesman(actorId)) return actorId;
  return requested ?? null;
}

@CommandHandler(CreateQuotationCommand)
export class CreateQuotationHandler
  implements ICommandHandler<CreateQuotationCommand, QuotationItem>
{
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async execute(command: CreateQuotationCommand): Promise<QuotationItem> {
    const salesmanUserId = await resolveSalesmanUserId(
      this.quotations,
      command.actorId,
      command.data.salesmanUserId,
    );
    const data = await buildQuotationData(
      this.quotations,
      { ...command.data, salesmanUserId },
      command.rights,
    );
    const number = await this.quotations.nextQuotationNumber(data.branchId);
    return this.quotations.create(number, data, command.actorId);
  }
}

@CommandHandler(UpdateQuotationCommand)
export class UpdateQuotationHandler
  implements ICommandHandler<UpdateQuotationCommand, QuotationItem>
{
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async execute(command: UpdateQuotationCommand): Promise<QuotationItem> {
    const existing = await this.quotations.findById(command.id);
    if (!existing) throw new NotFoundError('Quotation not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError(
        `Only draft quotations can be edited (this one is ${existing.status})`,
      );
    }

    const merged: CreateQuotationInput = {
      customerId: command.data.customerId ?? existing.customerId,
      customerName: command.data.customerName ?? existing.customerName,
      customerAddress: command.data.customerAddress ?? existing.customerAddress ?? undefined,
      customerMobile: command.data.customerMobile ?? existing.customerMobile ?? undefined,
      salesmanUserId: await resolveSalesmanUserId(
        this.quotations,
        command.actorId,
        command.data.salesmanUserId ?? existing.salesmanUserId,
      ),
      salesmanName: command.data.salesmanName ?? existing.salesmanName ?? undefined,
      branchId: command.data.branchId ?? existing.branchId,
      quotationDate: command.data.quotationDate ?? existing.quotationDate,
      validUntil: command.data.validUntil ?? existing.validUntil ?? undefined,
      freightCharge: command.data.freightCharge ?? existing.freightCharge,
      unloadingCharge: command.data.unloadingCharge ?? existing.unloadingCharge,
      loadingCharge: command.data.loadingCharge ?? existing.loadingCharge,
      roundOff: command.data.roundOff ?? existing.roundOff,
      remarks: command.data.remarks ?? existing.remarks ?? undefined,
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

    const data = await buildQuotationData(this.quotations, merged, command.rights);
    return this.quotations.update(command.id, command.data.version, data, command.actorId);
  }
}

@CommandHandler(ChangeQuotationStatusCommand)
export class ChangeQuotationStatusHandler
  implements ICommandHandler<ChangeQuotationStatusCommand, QuotationItem>
{
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async execute(command: ChangeQuotationStatusCommand): Promise<QuotationItem> {
    const quotation = await this.quotations.findById(command.id);
    if (!quotation) throw new NotFoundError('Quotation not found');

    // DRAFT -> SENT -> ACCEPTED | REJECTED. Converted quotations are locked.
    const allowedFrom: Record<typeof command.status, QuotationStatus[]> = {
      SENT: ['DRAFT'],
      ACCEPTED: ['SENT'],
      REJECTED: ['DRAFT', 'SENT'],
    };
    if (!allowedFrom[command.status].includes(quotation.status)) {
      throw new ValidationError(
        `A ${quotation.status.toLowerCase()} quotation cannot be marked ${command.status.toLowerCase()}`,
      );
    }
    if (command.status === 'ACCEPTED' && quotation.isExpired) {
      throw new ValidationError('This quotation has expired; issue a new one');
    }

    // Accepting is the moment a walk-in becomes a customer, so the master record is made
    // here rather than left for a clerk to remember. It happens before the status moves:
    // a quote that cannot be registered — no phone to identify the person by — should
    // stay in the state it was in, not sit accepted with nobody to order for.
    if (command.status === 'ACCEPTED' && !quotation.customerId) {
      await this.quotations.registerWalkIn(
        command.id,
        walkInRegistration({
          customerName: quotation.customerName,
          customerMobile: quotation.customerMobile,
          customerAddress: quotation.customerAddress,
        }),
        command.actorId,
      );
    }

    return this.quotations.setStatus(command.id, command.version, command.status, command.actorId);
  }
}

@QueryHandler(QuotationPrintQuery)
export class QuotationPrintHandler
  implements IQueryHandler<QuotationPrintQuery, QuotationPrintData>
{
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  async execute(query: QuotationPrintQuery): Promise<QuotationPrintData> {
    const data = await this.quotations.printData(query.id);
    if (!data) throw new NotFoundError('Quotation not found');
    return data;
  }
}

@QueryHandler(QuotationStockQuery)
export class QuotationStockHandler
  implements IQueryHandler<QuotationStockQuery, AvailableStockItem[]>
{
  constructor(@Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository) {}

  execute(query: QuotationStockQuery): Promise<AvailableStockItem[]> {
    return this.quotations.availableStock(query.branchId, query.productIds);
  }
}
