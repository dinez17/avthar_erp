import type {
  AreaAudit,
  ProductRateUpdateEntry,
  Paginated,
  PaginationQuery,
  ProductItem,
  ProductUom,
  UUID,
} from '@tiles-erp/shared-types';

export const PRODUCTS_REPOSITORY = Symbol('PRODUCTS_REPOSITORY');

export interface ProductListFilter {
  categoryId?: UUID;
  brandId?: UUID;
  seriesId?: UUID;
  sizeMm?: string;
  isActive?: boolean;
}

export interface CreateProductData {
  sku: string;
  name: string;
  description: string | null;
  categoryId: UUID;
  brandId: UUID;
  seriesId: UUID | null;
  collectionId: UUID | null;
  sizeMm: string | null;
  piecesPerBox: number;
  sqftPerBox: number;
  baseUom: ProductUom;
  hsnCode: string;
  gstRate: number;
  mrp: number | null;
  sellingRate: number | null;
  barcode: string | null;
  reorderLevelBoxes: number | null;
  isActive: boolean;
  createdBy: UUID;
}

export interface UpdateProductData {
  sku?: string;
  name?: string;
  description?: string | null;
  categoryId?: UUID;
  brandId?: UUID;
  seriesId?: UUID | null;
  collectionId?: UUID | null;
  sizeMm?: string | null;
  piecesPerBox?: number;
  sqftPerBox?: number;
  baseUom?: ProductUom;
  hsnCode?: string;
  gstRate?: number;
  mrp?: number | null;
  sellingRate?: number | null;
  barcode?: string | null;
  reorderLevelBoxes?: number | null;
  isActive?: boolean;
  updatedBy: UUID;
  version: number;
}

/** Port for product-master persistence. */
export interface ProductsRepository {
  /** Distinct non-empty sizes present in the catalogue, for filter dropdowns. */
  listSizes(): Promise<string[]>;
  /** Applies purchase/transport/additional rates and recomputes landing cost per row. */
  bulkUpdateRates(items: ProductRateUpdateEntry[], updatedBy: UUID): Promise<ProductItem[]>;
  list(query: PaginationQuery, filter: ProductListFilter): Promise<Paginated<ProductItem>>;
  findById(id: UUID): Promise<ProductItem | null>;
  create(data: CreateProductData): Promise<ProductItem>;
  update(id: UUID, data: UpdateProductData): Promise<ProductItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;

  /**
   * Products whose recorded sq.ft per box disagrees with their own size.
   *
   * The figure is typed by hand and nothing downstream questions it, so a box recorded at
   * 3,600 sq.ft instead of 11.63 makes stock valuation and margin silently absurd.
   */
  auditArea(): Promise<AreaAudit>;

  /** Replaces the recorded area with the figure the size implies. */
  fixArea(productIds: UUID[] | undefined, updatedBy: UUID): Promise<{ fixed: number }>;
}
