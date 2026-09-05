/** Level-specific behavioural rules applied by the generic handlers. */
export interface OrgNodeRules {
  /** Human label used in error messages, e.g. "Branch". */
  label: string;
  /** Whether a parent id is mandatory on create (everything except Company). */
  requiresParent: boolean;
  /** Whether a code is mandatory on create (everything except Company). */
  requiresCode: boolean;
}

export const COMPANY_RULES: OrgNodeRules = { label: 'Company', requiresParent: false, requiresCode: false };
export const BRANCH_RULES: OrgNodeRules = { label: 'Branch', requiresParent: true, requiresCode: true };
export const GODOWN_RULES: OrgNodeRules = { label: 'Godown', requiresParent: true, requiresCode: true };
export const GATE_RULES: OrgNodeRules = { label: 'Gate', requiresParent: true, requiresCode: true };
export const RACK_RULES: OrgNodeRules = { label: 'Rack', requiresParent: true, requiresCode: true };
