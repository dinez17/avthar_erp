import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { calculatePurchaseLine, NotFoundError, sumPurchaseTotals, ValidationError } from '@tiles-erp/shared';
import type {
  CreatePurchaseOrderInput,
  Paginated,
  PaginationQuery,
  PurchaseOrderItem,
  PurchaseOrderLineInput,
  UpdatePurchaseOrderInput,
  UUID,
} from '@tiles-erp/shared-types';
import {
  PURCHASE_ORDER_REPOSITORY,
  type OrderWriteData,
  type PurchaseOrderFilter,
  type PurchaseOrderRepository,
  type ResolvedOrderLine,
} from '../domain/purchase-order.repository';

const MAX_LINES = 200;

export class ListPurchaseOrdersQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: PurchaseOrderFilter,
  ) {}
}

export class GetPurchaseOrderQuery {
  constructor(public readonly id: UUID) {}
}

export class CreatePurchaseOrderCommand {
  constructor(
    public readonly data: CreatePurchaseOrderInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdatePurchaseOrderCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdatePurchaseOrderInput,
    public readonly actorId: UUID,
  ) {}
}

export class ApprovePurchaseOrderCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

export class CancelPurchaseOrderCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListPurchaseOrdersQuery)
export class ListPurchaseOrdersHandler
  implements IQueryHandler<ListPurchaseOrdersQuery, Paginated<PurchaseOrderItem>>
{
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  execute(query: ListPurchaseOrdersQuery): Promise<Paginated<PurchaseOrderItem>> {
    return this.orders.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetPurchaseOrderQuery)
export class GetPurchaseOrderHandler
  implements IQueryHandler<GetPurchaseOrderQuery, PurchaseOrderItem>
{
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(query: GetPurchaseOrderQuery): Promise<PurchaseOrderItem> {
    const order = await this.orders.findById(query.id);
    if (!order) throw new NotFoundError('Purchase order not found');
    return order;
  }
}

/** Shared line resolution: validates input and computes amounts via the shared formula. */
async function buildWriteData(
  orders: PurchaseOrderRepository,
  input: {
    supplierId: UUID;
    branchId: UUID;
    orderDate?: string;
    expectedDate?: string;
    remarks?: string;
    lines: PurchaseOrderLineInput[];
  },
): Promise<OrderWriteData> {
  if (input.lines.length === 0) throw new ValidationError('At least one line is required');
  if (input.lines.length > MAX_LINES) {
    throw new ValidationError(`At most ${MAX_LINES} lines per order`);
  }

  await orders.assertReferences(input.supplierId, input.branchId);
  const gstRates = await orders.productGstRates(input.lines.map((l) => l.productId));

  const seen = new Set<string>();
  const resolved: ResolvedOrderLine[] = input.lines.map((line) => {
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
    if (discountPct < 0 || discountPct > 100) {
      throw new ValidationError(`${product.sku}: discount must be between 0 and 100`);
    }
    const gstRate = line.gstRate ?? product.gstRate;

    const amounts = calculatePurchaseLine(line.qtyBoxes, line.rate, discountPct, gstRate);
    return {
      productId: line.productId,
      qtyBoxes: line.qtyBoxes,
      rate: line.rate,
      discountPct,
      gstRate,
      ...amounts,
    };
  });

  const totals = sumPurchaseTotals(resolved);
  return {
    supplierId: input.supplierId,
    branchId: input.branchId,
    orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
    expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
    remarks: input.remarks ?? null,
    ...totals,
    lines: resolved,
  };
}

@CommandHandler(CreatePurchaseOrderCommand)
export class CreatePurchaseOrderHandler
  implements ICommandHandler<CreatePurchaseOrderCommand, PurchaseOrderItem>
{
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(command: CreatePurchaseOrderCommand): Promise<PurchaseOrderItem> {
    const data = await buildWriteData(this.orders, command.data);
    const poNumber = await this.orders.nextPoNumber(data.branchId);
    return this.orders.create(poNumber, data, command.actorId);
  }
}

@CommandHandler(UpdatePurchaseOrderCommand)
export class UpdatePurchaseOrderHandler
  implements ICommandHandler<UpdatePurchaseOrderCommand, PurchaseOrderItem>
{
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(command: UpdatePurchaseOrderCommand): Promise<PurchaseOrderItem> {
    const existing = await this.orders.findById(command.id);
    if (!existing) throw new NotFoundError('Purchase order not found');

    const data = await buildWriteData(this.orders, {
      supplierId: command.data.supplierId ?? existing.supplierId,
      branchId: command.data.branchId ?? existing.branchId,
      orderDate: command.data.orderDate ?? existing.orderDate,
      expectedDate: command.data.expectedDate ?? existing.expectedDate ?? undefined,
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
    });

    return this.orders.update(command.id, command.data.version, data, command.actorId);
  }
}

@CommandHandler(ApprovePurchaseOrderCommand)
export class ApprovePurchaseOrderHandler
  implements ICommandHandler<ApprovePurchaseOrderCommand, PurchaseOrderItem>
{
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(command: ApprovePurchaseOrderCommand): Promise<PurchaseOrderItem> {
    const order = await this.orders.findById(command.id);
    if (!order) throw new NotFoundError('Purchase order not found');
    if (order.status !== 'DRAFT') {
      throw new ValidationError(`Only draft orders can be approved (this one is ${order.status})`);
    }
    return this.orders.setStatus(command.id, command.version, 'APPROVED', command.actorId);
  }
}

@CommandHandler(CancelPurchaseOrderCommand)
export class CancelPurchaseOrderHandler
  implements ICommandHandler<CancelPurchaseOrderCommand, PurchaseOrderItem>
{
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(command: CancelPurchaseOrderCommand): Promise<PurchaseOrderItem> {
    const order = await this.orders.findById(command.id);
    if (!order) throw new NotFoundError('Purchase order not found');
    if (order.status === 'RECEIVED' || order.status === 'PARTIALLY_RECEIVED') {
      throw new ValidationError('Orders with received goods cannot be cancelled');
    }
    if (order.status === 'CANCELLED') return order;
    return this.orders.setStatus(command.id, command.version, 'CANCELLED', command.actorId);
  }
}
