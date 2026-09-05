import type {
  DriverCashReport,
  FreightCollectionReport,
  PendingDispatchAgeReport,
  UUID,
  VehicleRunningReport,
} from '@tiles-erp/shared-types';

export const DISPATCH_REPORT_REPOSITORY = Symbol('DISPATCH_REPORT_REPOSITORY');

/** The period a dispatch report covers, and the branch it is narrowed to. */
export interface DispatchReportWindow {
  from: Date;
  to: Date;
  branchId?: UUID;
}

/**
 * Port for the four dispatch reports.
 *
 * All of them read gate passes, but each answers a different person's question — the
 * money owed, the lorry's economics, the driver's cash, and the backlog on the floor —
 * so they are four calls rather than one wide one nobody uses whole.
 */
export interface DispatchReportRepository {
  /** What each customer was charged for freight and what came back. */
  freightCollection(window: DispatchReportWindow): Promise<FreightCollectionReport>;
  /** Distance, hire and freight per vehicle, over trips closed in the period. */
  vehicleRunning(window: DispatchReportWindow): Promise<VehicleRunningReport>;
  /** What each driver was sent to collect against what reached the desk. */
  driverCash(window: DispatchReportWindow): Promise<DriverCashReport>;
  /** Posted invoices with goods still in the godown, aged. Not period-bound. */
  pendingAgeing(branchId?: UUID): Promise<PendingDispatchAgeReport>;
}
