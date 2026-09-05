import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import type {
  BranchPriceItem,
  BulkUpdateBranchPricesInput,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import {
  BRANCH_PRICES_REPOSITORY,
  type BranchPricesRepository,
} from '../domain/branch-prices.repository';
import type { ProductListFilter } from '../domain/products.repository';

export class ListBranchPricesQuery {
  constructor(
    public readonly branchId: UUID,
    public readonly pagination: PaginationQuery,
    public readonly filter: ProductListFilter,
  ) {}
}

export class BulkUpdateBranchPricesCommand {
  constructor(
    public readonly data: BulkUpdateBranchPricesInput,
    public readonly actorId: UUID,
  ) {}
}

const MAX_PRICE_ITEMS = 200;

@QueryHandler(ListBranchPricesQuery)
export class ListBranchPricesHandler
  implements IQueryHandler<ListBranchPricesQuery, Paginated<BranchPriceItem>>
{
  constructor(
    @Inject(BRANCH_PRICES_REPOSITORY) private readonly prices: BranchPricesRepository,
  ) {}

  execute(query: ListBranchPricesQuery): Promise<Paginated<BranchPriceItem>> {
    return this.prices.list(query.branchId, query.pagination, query.filter);
  }
}

@CommandHandler(BulkUpdateBranchPricesCommand)
export class BulkUpdateBranchPricesHandler
  implements ICommandHandler<BulkUpdateBranchPricesCommand, BranchPriceItem[]>
{
  constructor(
    @Inject(BRANCH_PRICES_REPOSITORY) private readonly prices: BranchPricesRepository,
  ) {}

  async execute(command: BulkUpdateBranchPricesCommand): Promise<BranchPriceItem[]> {
    const { branchId, items } = command.data;
    if (items.length === 0) throw new ValidationError('At least one product is required');
    if (items.length > MAX_PRICE_ITEMS) {
      throw new ValidationError(`At most ${MAX_PRICE_ITEMS} products per request`);
    }

    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.productId)) throw new ValidationError('Duplicate products in request');
      seen.add(item.productId);

      if (item.displayPrice < 0 || item.minSellingPrice < 0 || item.sellingPrice < 0) {
        throw new ValidationError('Prices cannot be negative');
      }
      if (item.sellingPrice < item.minSellingPrice) {
        throw new ValidationError(
          'Actual selling price cannot be below the minimum selling price',
        );
      }
      if (item.displayPrice < item.sellingPrice) {
        throw new ValidationError('Display price cannot be below the actual selling price');
      }
    }

    return this.prices.bulkUpsert(branchId, items, command.actorId);
  }
}
