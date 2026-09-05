import type {
  OrgNodeItem,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';

export const COMPANY_REPOSITORY = Symbol('COMPANY_REPOSITORY');
export const BRANCH_REPOSITORY = Symbol('BRANCH_REPOSITORY');
export const GODOWN_REPOSITORY = Symbol('GODOWN_REPOSITORY');
export const GATE_REPOSITORY = Symbol('GATE_REPOSITORY');
export const RACK_REPOSITORY = Symbol('RACK_REPOSITORY');

export interface OrgContactData {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
}

export interface CreateOrgNodeData extends OrgContactData {
  name: string;
  code: string | null;
  legalName: string | null;
  gstin: string | null;
  parentId: UUID | null;
  isActive: boolean;
  createdBy: UUID;
}

export interface UpdateOrgNodeData {
  name?: string;
  code?: string;
  legalName?: string | null;
  gstin?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  updatedBy: UUID;
  version: number;
}

/**
 * Uniform persistence port implemented once per hierarchy level. Level-specific
 * rules (unique-code scope, parent validation, child blocking) live in the
 * implementations; the handlers stay generic.
 */
export interface OrgNodeRepository {
  list(query: PaginationQuery, parentId?: UUID): Promise<Paginated<OrgNodeItem>>;
  create(data: CreateOrgNodeData): Promise<OrgNodeItem>;
  update(id: UUID, data: UpdateOrgNodeData): Promise<OrgNodeItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}

export interface BulkCreateOrgNodeData {
  parentId: UUID;
  isActive: boolean;
  createdBy: UUID;
  items: { name: string; code: string }[];
}

/** Extended port for levels that support bulk creation (Gate, Rack). */
export interface OrgNodeBulkRepository extends OrgNodeRepository {
  bulkCreate(data: BulkCreateOrgNodeData): Promise<OrgNodeItem[]>;
}
