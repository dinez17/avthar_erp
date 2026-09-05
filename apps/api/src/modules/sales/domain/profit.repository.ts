import type { ISODateString, ProfitGrouping, ProfitReport, UUID } from '@tiles-erp/shared-types';

export const PROFIT_REPOSITORY = Symbol('PROFIT_REPOSITORY');

export interface ProfitFilter {
  from: ISODateString;
  to: ISODateString;
  branchId?: UUID;
  salesmanUserId?: UUID;
  productId?: UUID;
}

/**
 * Port for margin: what was sold, what it cost, and the difference.
 *
 * Cost is read from the figure frozen on each invoice line at posting, so a report run
 * today for last quarter gives the same answer it gave then.
 */
export interface ProfitRepository {
  report(grouping: ProfitGrouping, filter: ProfitFilter): Promise<ProfitReport>;
}
