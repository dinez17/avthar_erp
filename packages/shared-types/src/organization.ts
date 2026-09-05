import type { UUID } from './common';

/** Levels of the company hierarchy: Company -> Branch -> Godown -> Gate -> Rack. */
export type OrgLevel = 'company' | 'branch' | 'godown' | 'gate' | 'rack';

export interface OrgScope {
  companyId: UUID;
  branchId?: UUID;
  godownId?: UUID;
  gateId?: UUID;
}
