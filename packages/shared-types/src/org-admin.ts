import type { UUID } from './common';

/**
 * Unified read model for every level of the company hierarchy
 * (Company -> Branch -> Godown -> Gate -> Rack). Fields that do not apply to a
 * given level (e.g. `code` for companies, `gstin` for godowns) are null.
 */
export interface OrgNodeItem {
  id: UUID;
  name: string;
  code: string | null;
  legalName: string | null;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  parentId: UUID | null;
  parentName: string | null;
  /** Number of direct children (branches for a company, godowns for a branch, ...). */
  childCount: number;
  version: number;
}

/** Write model accepted by every org-node create endpoint. */
export interface CreateOrgNodeInput {
  name: string;
  code?: string;
  legalName?: string;
  gstin?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  parentId?: UUID;
  isActive?: boolean;
}

/** Write model accepted by every org-node update endpoint. */
export interface UpdateOrgNodeInput {
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
  version: number;
}

/** One entry in a bulk org-node create request. */
export interface BulkOrgNodeEntry {
  name: string;
  code: string;
}

/** Write model for bulk creation of gates/racks under one parent. */
export interface BulkCreateOrgNodesInput {
  parentId: UUID;
  isActive?: boolean;
  items: BulkOrgNodeEntry[];
}
