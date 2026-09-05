import type {
  CreatePartyInput,
  Paginated,
  PaginationQuery,
  PartyItem,
  UpdatePartyInput,
  UUID,
} from '@tiles-erp/shared-types';

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');
export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');

export interface PartyListFilter {
  isActive?: boolean;
  stateCode?: string;
}

export type CreatePartyData = CreatePartyInput & { createdBy: UUID };
export type UpdatePartyData = UpdatePartyInput & { updatedBy: UUID };

/** Uniform persistence port implemented once per party master. */
export interface PartyRepository {
  list(query: PaginationQuery, filter: PartyListFilter): Promise<Paginated<PartyItem>>;
  findById(id: UUID): Promise<PartyItem | null>;
  codeExists(code: string, excludeId?: UUID): Promise<boolean>;
  /** Returns the party already holding this phone number, if any. */
  findByPhone(phone: string, excludeId?: UUID): Promise<PartyItem | null>;
  /** Next sequential code, e.g. CUST-000042. */
  nextCode(): Promise<string>;
  create(data: CreatePartyData): Promise<PartyItem>;
  update(id: UUID, data: UpdatePartyData): Promise<PartyItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}
