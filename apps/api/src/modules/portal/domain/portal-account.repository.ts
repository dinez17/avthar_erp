import type {
  Paginated,
  PaginationQuery,
  PortalAccountItem,
  PortalMe,
  PortalPartyType,
  UUID,
} from '@tiles-erp/shared-types';

export const PORTAL_ACCOUNT_REPOSITORY = Symbol('PORTAL_ACCOUNT_REPOSITORY');

export interface PortalAccountListFilter {
  partyType?: PortalPartyType;
  supplierId?: UUID;
  customerId?: UUID;
  isActive?: boolean;
}

export interface ProvisionUserData {
  email: string;
  fullName: string;
  passwordHash: string;
  /** System role to grant the new login, e.g. SUPPLIER. */
  roleName: string;
  createdBy: UUID;
}

export interface PortalAccountRepository {
  list(query: PaginationQuery, filter: PortalAccountListFilter): Promise<Paginated<PortalAccountItem>>;
  findById(id: UUID): Promise<PortalAccountItem | null>;
  /** The party's display name if it exists and is not deleted, else null. */
  partyName(partyType: PortalPartyType, partyId: UUID): Promise<string | null>;
  /** The id of an existing (non-deleted) user for this email, or null. */
  findUserIdByEmail(email: string): Promise<UUID | null>;
  /** Creates a login with the given system role and returns its id. */
  provisionUser(data: ProvisionUserData): Promise<UUID>;
  /** Whether a link between this user and party already exists, in any state. */
  linkExists(userId: UUID, partyType: PortalPartyType, partyId: UUID): Promise<boolean>;
  createAccount(
    userId: UUID,
    partyType: PortalPartyType,
    partyId: UUID,
    createdBy: UUID,
  ): Promise<PortalAccountItem>;
  setActive(id: UUID, isActive: boolean, actorId: UUID): Promise<PortalAccountItem>;
  softDelete(id: UUID, actorId: UUID): Promise<void>;
  /** The parties the given user may act for, shaped for /portal/me. */
  partiesForUser(userId: UUID): Promise<PortalMe>;
  /** Whether the user holds an active, non-deleted link to this supplier. */
  hasSupplierAccess(userId: UUID, supplierId: UUID): Promise<boolean>;
}
