import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  EventBus,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  AreaAudit,
  BulkUpdateProductRatesInput,
  CreateProductInput,
  Paginated,
  PaginationQuery,
  ProductItem,
  UpdateProductInput,
  UUID,
} from '@tiles-erp/shared-types';
import { ProductChangedEvent } from '../domain/product-changed.event';
import {
  PRODUCTS_REPOSITORY,
  type ProductListFilter,
  type ProductsRepository,
} from '../domain/products.repository';

export class ListProductsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: ProductListFilter,
  ) {}
}

export class ListProductSizesQuery {}

export class GetProductQuery {
  constructor(public readonly productId: UUID) {}
}

export class CreateProductCommand {
  constructor(
    public readonly data: CreateProductInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdateProductCommand {
  constructor(
    public readonly productId: UUID,
    public readonly data: UpdateProductInput,
    public readonly actorId: UUID,
  ) {}
}

export class DeleteProductCommand {
  constructor(
    public readonly productId: UUID,
    public readonly actorId: UUID,
  ) {}
}

export class BulkUpdateProductRatesCommand {
  constructor(
    public readonly data: BulkUpdateProductRatesInput,
    public readonly actorId: UUID,
  ) {}
}

const assertUomSanity = (piecesPerBox?: number, sqftPerBox?: number): void => {
  if (piecesPerBox !== undefined && piecesPerBox < 1) {
    throw new ValidationError('piecesPerBox must be at least 1');
  }
  if (sqftPerBox !== undefined && sqftPerBox <= 0) {
    throw new ValidationError('sqftPerBox must be greater than 0');
  }
};

@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<
  ListProductsQuery,
  Paginated<ProductItem>
> {
  constructor(@Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository) {}

  execute(query: ListProductsQuery): Promise<Paginated<ProductItem>> {
    return this.products.list(query.pagination, query.filter);
  }
}

@QueryHandler(ListProductSizesQuery)
export class ListProductSizesHandler implements IQueryHandler<ListProductSizesQuery, string[]> {
  constructor(@Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository) {}

  execute(): Promise<string[]> {
    return this.products.listSizes();
  }
}

@QueryHandler(GetProductQuery)
export class GetProductHandler implements IQueryHandler<GetProductQuery, ProductItem> {
  constructor(@Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository) {}

  async execute(query: GetProductQuery): Promise<ProductItem> {
    const product = await this.products.findById(query.productId);
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }
}

@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand, ProductItem> {
  constructor(
    @Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateProductCommand): Promise<ProductItem> {
    const { data } = command;
    assertUomSanity(data.piecesPerBox, data.sqftPerBox);
    const created = await this.products.create({
      sku: data.sku.trim().toUpperCase(),
      name: data.name.trim(),
      description: data.description?.trim() || null,
      categoryId: data.categoryId,
      brandId: data.brandId,
      seriesId: data.seriesId ?? null,
      collectionId: data.collectionId ?? null,
      sizeMm: data.sizeMm?.trim() || null,
      piecesPerBox: data.piecesPerBox,
      sqftPerBox: data.sqftPerBox,
      baseUom: data.baseUom ?? 'BOX',
      hsnCode: data.hsnCode.trim(),
      gstRate: data.gstRate,
      mrp: data.mrp ?? null,
      sellingRate: data.sellingRate ?? null,
      barcode: data.barcode?.trim() || null,
      reorderLevelBoxes: data.reorderLevelBoxes ?? null,
      isActive: data.isActive ?? true,
      createdBy: command.actorId,
    });
    // After the write, never inside it: a slow third party must not hold a transaction
    // open, and a product must save here whether or not SixOrbit is reachable.
    this.eventBus.publish(new ProductChangedEvent(created.id, command.actorId));
    return created;
  }
}

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand, ProductItem> {
  constructor(
    @Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateProductCommand): Promise<ProductItem> {
    const { data } = command;
    assertUomSanity(data.piecesPerBox, data.sqftPerBox);
    const updated = await this.products.update(command.productId, {
      ...data,
      sku: data.sku?.trim().toUpperCase(),
      name: data.name?.trim(),
      description: data.description === null ? null : data.description?.trim(),
      sizeMm: data.sizeMm === null ? null : data.sizeMm?.trim(),
      hsnCode: data.hsnCode?.trim(),
      barcode: data.barcode === null ? null : data.barcode?.trim(),
      updatedBy: command.actorId,
    });
    this.eventBus.publish(new ProductChangedEvent(command.productId, command.actorId));
    return updated;
  }
}

@CommandHandler(DeleteProductCommand)
export class DeleteProductHandler implements ICommandHandler<DeleteProductCommand, void> {
  constructor(@Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository) {}

  async execute(command: DeleteProductCommand): Promise<void> {
    await this.products.softDelete(command.productId, command.actorId);
  }
}

const MAX_RATE_ITEMS = 200;

@CommandHandler(BulkUpdateProductRatesCommand)
export class BulkUpdateProductRatesHandler implements ICommandHandler<
  BulkUpdateProductRatesCommand,
  ProductItem[]
> {
  constructor(@Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository) {}

  async execute(command: BulkUpdateProductRatesCommand): Promise<ProductItem[]> {
    const { items } = command.data;
    if (items.length === 0) throw new ValidationError('At least one product is required');
    if (items.length > MAX_RATE_ITEMS) {
      throw new ValidationError(`At most ${MAX_RATE_ITEMS} products per request`);
    }
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.productId)) {
        throw new ValidationError('Duplicate products in request');
      }
      seen.add(item.productId);
      if (item.purchaseRate < 0 || item.transportRate < 0 || item.additionalRate < 0) {
        throw new ValidationError('Rates cannot be negative');
      }
      if (item.gstRate !== undefined && (item.gstRate < 0 || item.gstRate > 28)) {
        throw new ValidationError('GST rate must be between 0 and 28');
      }
    }
    return this.products.bulkUpdateRates(items, command.actorId);
  }
}

/** Products whose recorded sq.ft per box disagrees with their own size. */
export class AuditProductAreaQuery {}

export class FixProductAreaCommand {
  constructor(
    public readonly productIds: string[] | undefined,
    public readonly actorId: string,
  ) {}
}

@QueryHandler(AuditProductAreaQuery)
export class AuditProductAreaHandler implements IQueryHandler<AuditProductAreaQuery, AreaAudit> {
  constructor(@Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository) {}

  execute(): Promise<AreaAudit> {
    return this.products.auditArea();
  }
}

@CommandHandler(FixProductAreaCommand)
export class FixProductAreaHandler implements ICommandHandler<
  FixProductAreaCommand,
  { fixed: number }
> {
  constructor(@Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository) {}

  execute(command: FixProductAreaCommand): Promise<{ fixed: number }> {
    return this.products.fixArea(command.productIds, command.actorId);
  }
}
