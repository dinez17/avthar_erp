import type { UUID } from './common';

export type CustomerType = 'RETAIL' | 'WHOLESALE' | 'DEALER' | 'PROJECT';

/** Shared contact/address shape for customers and suppliers. */
export interface PartyContact {
  contactPerson: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
}

/** Unified read model for both party masters. */
export interface PartyItem extends PartyContact {
  id: UUID;
  code: string;
  name: string;
  gstin: string | null;
  panNumber: string | null;
  openingBalance: number;
  isActive: boolean;
  notes: string | null;
  /** Customers only. */
  type: CustomerType | null;
  creditDays: number | null;
  creditLimit: number | null;
  /** Suppliers only. */
  paymentTermDays: number | null;
  version: number;
}

export interface CreatePartyInput extends Partial<PartyContact> {
  /** Omitted, the API assigns the next sequential code. */
  code?: string;
  name: string;
  gstin?: string;
  panNumber?: string;
  openingBalance?: number;
  notes?: string;
  isActive?: boolean;
  type?: CustomerType;
  creditDays?: number;
  creditLimit?: number;
  paymentTermDays?: number;
}

export interface UpdatePartyInput extends Partial<CreatePartyInput> {
  version: number;
}
