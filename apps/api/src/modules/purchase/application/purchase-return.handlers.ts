import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { calculatePurchaseLine, NotFoundError, sumPurchaseTotals, ValidationError } from '@tiles-erp/shared';
import type {
  CreatePurchaseReturnInput,
  Paginated,
  PaginationQuery,
  PurchaseReturnItem,
  UUID,
} from '@tiles-erp/shared-types';
import {
  PURCHASE_RETURN_REPOSITORY,
  type PurchaseReturnRepository,
  type ResolvedReturnLine,
  type ReturnFilter,
} from '../domain/purchase-return.repository';
import {
  PURCHASE_ORDER_REPOSITORY,
  type PurchaseOrderRepository,
} from '../domain/purchase-order.repository';

const MAX_LINES = 200;

export class ListPurchaseReturnsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: ReturnFilter,
  ) {}
}

export class GetPurchaseReturnQuery {
  constructor(public readonly id: UUID) {}
}

export class CreatePurchaseReturnCommand {
  constructor(
    public readonly data: CreatePurchaseReturnInput,
    public readonly actorId: UUID,
  ) {}
}

export class PostPurchaseReturnCommand {
  constructor(
    public readonly id: UUID,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListPurchaseReturnsQuery)
export class ListPurchaseReturnsHandler
  implements IQueryHandler<ListPurchaseReturnsQuery, Paginated<PurchaseReturnItem>>
{
  constructor(
    @Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepository,
  ) {}

  execute(query: ListPurchaseReturnsQuery): Promise<Paginated<PurchaseReturnItem>> {
    return this.returns.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetPurchaseReturnQuery)
export class GetPurchaseReturnHandler
  implements IQueryHandler<GetPurchaseReturnQuery, PurchaseReturnItem>
{
  constructor(
    @Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepository,
  ) {}

  async execute(query: GetPurchaseReturnQuery): Promise<PurchaseReturnItem> {
    const found = await this.returns.findById(query.id);
    if (!found) throw new NotFoundError('Purchase return not found');
    return found;
  }
}

@CommandHandler(CreatePurchaseReturnCommand)
export class CreatePurchaseReturnHandler
  implements ICommandHandler<CreatePurchaseReturnCommand, PurchaseReturnItem>
{
  constructor(
    @Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
  ) {}

  async execute(command: CreatePurchaseReturnCommand): Promise<PurchaseReturnItem> {
    const { data } = command;
    if (!data.reason?.trim()) throw new ValidationError('A return reason is required');
    if (data.lines.length === 0) throw new ValidationError('At least one line is required');
    if (data.lines.length > MAX_LINES) {
      throw new ValidationError(`At most ${MAX_LINES} lines per return`);
    }

    await this.returns.assertEndpoints(data.supplierId, data.branchId, data.godownId);

    const gstRates = await this.orders.productGstRates(data.lines.map((l) => l.productId));
    const seen = new Set<string>();

    const resolved: ResolvedReturnLine[] = data.lines.map((line) => {
      const product = gstRates.get(line.productId);
      if (!product) throw new ValidationError('One or more products no longer exist');

      const key = `${line.productId}|${line.batchNo ?? ''}|${line.shade ?? ''}`;
      if (seen.has(key)) {
        throw new ValidationError(
          `${product.sku}: the same batch/shade appears more than once; combine those lines`,
        );
      }
      seen.add(key);

      if (line.qtyBoxes <= 0) {
        throw new ValidationError(`${product.sku}: quantity must be greater than zero`);
      }
      if (line.rate < 0) throw new ValidationError(`${product.sku}: rate cannot be negative`);

      const gstRate = line.gstRate ?? product.gstRate;
      const amounts = calculatePurchaseLine(line.qtyBoxes, line.rate, 0, gstRate);
      return {
        productId: line.productId,
        batchNo: line.batchNo ?? null,
        shade: line.shade ?? null,
        qtyBoxes: line.qtyBoxes,
        rate: line.rate,
        gstRate,
        ...amounts,
      };
    });

    const totals = sumPurchaseTotals(resolved);
    const returnNumber = await this.returns.nextReturnNumber(data.branchId);

    return this.returns.create({
      returnNumber,
      supplierId: data.supplierId,
      branchId: data.branchId,
      godownId: data.godownId,
      receiptId: data.receiptId ?? null,
      returnDate: data.returnDate ? new Date(data.returnDate) : new Date(),
      reason: data.reason.trim(),
      remarks: data.remarks ?? null,
      ...totals,
      createdBy: command.actorId,
      lines: resolved,
    });
  }
}

@CommandHandler(PostPurchaseReturnCommand)
export class PostPurchaseReturnHandler
  implements ICommandHandler<PostPurchaseReturnCommand, PurchaseReturnItem>
{
  constructor(
    @Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepository,
  ) {}

  execute(command: PostPurchaseReturnCommand): Promise<PurchaseReturnItem> {
    return this.returns.post(command.id, command.version, command.actorId);
  }
}
