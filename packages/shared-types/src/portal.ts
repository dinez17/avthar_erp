import type { ISODateString, UUID } from './common';

export type PortalPartyType = 'SUPPLIER' | 'CUSTOMER';

/** A supplier's response to a purchase order, made from the portal. */
export type PoAckStatus = 'PENDING' | 'ACKNOWLEDGED' | 'QUERIED';

// ---- Provisioning (admin side) ----

/** A portal login as the admin sees it in the access list. */
export interface PortalAccountItem {
  id: UUID;
  userId: UUID;
  email: string;
  fullName: string;
  partyType: PortalPartyType;
  supplierId: UUID | null;
  customerId: UUID | null;
  /** The party's display name (supplier or customer). */
  partyName: string | null;
  isActive: boolean;
  createdAt: ISODateString;
}

/** Create a portal login for a party. An existing user is linked by email; a new one is
 *  created with the given name and a temporary password. */
export interface CreatePortalAccountInput {
  partyType: PortalPartyType;
  supplierId?: UUID;
  customerId?: UUID;
  email: string;
  fullName: string;
  /** Omitted, a temporary password is generated and returned once. */
  password?: string;
}

/** The result of provisioning: the account plus the one-time password when generated. */
export interface PortalAccountCreated {
  account: PortalAccountItem;
  /** Present only when a new user was created and a password was generated. */
  temporaryPassword: string | null;
}

// ---- Portal side (the logged-in external user) ----

/** A party the current portal user may act for. */
export interface PortalParty {
  accountId: UUID;
  partyType: PortalPartyType;
  partyId: UUID;
  code: string;
  name: string;
}

/** What the portal shell needs: who the user is and which parties they can act for. */
export interface PortalMe {
  userId: UUID;
  email: string;
  fullName: string;
  suppliers: PortalParty[];
  customers: PortalParty[];
}

// ---- Supplier portal read models ----

export interface SupplierPortalSummary {
  supplierId: UUID;
  supplierName: string;
  /** Orders awaiting the supplier's acknowledgement. */
  ordersToAcknowledge: number;
  openOrders: number;
  /** Invoices not yet fully paid. */
  unpaidInvoices: number;
  /** Amount still owed to the supplier. */
  outstanding: number;
}

export interface SupplierPortalOrder {
  id: UUID;
  poNumber: string;
  orderDate: ISODateString;
  expectedDate: ISODateString | null;
  branchName: string;
  status: string;
  ackStatus: PoAckStatus;
  ackAt: ISODateString | null;
  ackNote: string | null;
  lineCount: number;
  grandTotal: number;
}

export interface SupplierPortalOrderLine {
  productName: string;
  sku: string;
  qtyBoxes: number;
  rate: number;
  lineTotal: number;
}

export interface SupplierPortalOrderDetail extends SupplierPortalOrder {
  remarks: string | null;
  lines: SupplierPortalOrderLine[];
}

export interface SupplierPortalInvoice {
  id: UUID;
  invoiceNumber: string;
  invoiceDate: ISODateString;
  branchName: string;
  status: string;
  grandTotal: number;
}

export interface SupplierPortalPayment {
  id: UUID;
  paymentNumber: string;
  paymentDate: ISODateString;
  mode: string;
  amount: number;
}

/** The supplier's acknowledgement of a purchase order. */
export interface AcknowledgeOrderInput {
  /** Accept the order, or raise a query against it. */
  decision: 'ACKNOWLEDGED' | 'QUERIED';
  note?: string;
}

/** A product the supplier supplies, with the company's stock and what is on order. */
export interface SupplierPortalProduct {
  productId: UUID;
  sku: string;
  name: string;
  sizeMm: string | null;
  gstRate: number;
  /** Latest agreed rate for this supplier, prefilled on the raise-PO form. */
  defaultRate: number | null;
  /** Company on-hand across all godowns, in boxes. */
  currentStock: number;
  /** Boxes still due on this supplier's open purchase orders. */
  poStock: number;
  /** How many open orders make up the PO stock. */
  poCount: number;
}

/** One open purchase order contributing to a product's PO stock. */
export interface SupplierPortalPoStockLine {
  poId: UUID;
  poNumber: string;
  orderedBoxes: number;
  pendingBoxes: number;
  expectedDate: ISODateString | null;
  status: string;
  ackStatus: PoAckStatus;
}

/** A branch a supplier may raise a purchase order against. */
export interface SupplierPortalBranch {
  id: UUID;
  name: string;
}

export interface RaiseSupplierPoLine {
  productId: UUID;
  boxes: number;
  rate: number;
  gstRate?: number;
}

/** A supplier-raised draft purchase order, for the company to review and approve. */
export interface RaiseSupplierPoInput {
  branchId: UUID;
  expectedDate?: ISODateString;
  remarks?: string;
  lines: RaiseSupplierPoLine[];
}
