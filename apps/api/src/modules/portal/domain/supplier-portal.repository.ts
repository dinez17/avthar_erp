import type {
  Paginated,
  PaginationQuery,
  SupplierPortalBranch,
  SupplierPortalInvoice,
  SupplierPortalOrder,
  SupplierPortalOrderDetail,
  SupplierPortalPayment,
  SupplierPortalPoStockLine,
  SupplierPortalProduct,
  SupplierPortalSummary,
  UUID,
} from '@tiles-erp/shared-types';

export const SUPPLIER_PORTAL_REPOSITORY = Symbol('SUPPLIER_PORTAL_REPOSITORY');

/** Reads and the one action a supplier may take, all scoped to a single supplier id. */
export interface SupplierPortalRepository {
  summary(supplierId: UUID): Promise<SupplierPortalSummary>;
  orders(supplierId: UUID, query: PaginationQuery): Promise<Paginated<SupplierPortalOrder>>;
  /** One order with its lines, only if it belongs to the supplier. */
  orderDetail(supplierId: UUID, orderId: UUID): Promise<SupplierPortalOrderDetail | null>;
  invoices(supplierId: UUID, query: PaginationQuery): Promise<Paginated<SupplierPortalInvoice>>;
  payments(supplierId: UUID, query: PaginationQuery): Promise<Paginated<SupplierPortalPayment>>;
  /** Products this supplier supplies, with company on-hand stock and open-PO stock. */
  products(supplierId: UUID): Promise<SupplierPortalProduct[]>;
  /** The open purchase orders behind one product's PO stock. */
  productPoStock(supplierId: UUID, productId: UUID): Promise<SupplierPortalPoStockLine[]>;
  /** Branches the supplier may raise a purchase order against. */
  branches(): Promise<SupplierPortalBranch[]>;
  /**
   * Records the supplier's acknowledgement or query on one of their orders. Returns null
   * when the order is not the supplier's, or the updated order when done.
   */
  acknowledgeOrder(
    supplierId: UUID,
    orderId: UUID,
    decision: 'ACKNOWLEDGED' | 'QUERIED',
    note: string | null,
    actorId: UUID,
  ): Promise<SupplierPortalOrder | 'NOT_FOUND' | 'NOT_ALLOWED'>;
}
