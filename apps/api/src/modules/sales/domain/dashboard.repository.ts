import type { DashboardSummary, UUID } from '@tiles-erp/shared-types';

export const DASHBOARD_REPOSITORY = Symbol('DASHBOARD_REPOSITORY');

export interface DashboardWindow {
  from: Date;
  to: Date;
  branchId?: UUID;
}

/** Port for the overview figures. Read-only: it never changes anything. */
export interface DashboardRepository {
  summary(window: DashboardWindow): Promise<DashboardSummary>;
}
