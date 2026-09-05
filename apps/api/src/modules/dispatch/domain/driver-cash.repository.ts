import type {
  DriverCashHandoverItem,
  DriverDueSummary,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';

export const DRIVER_CASH_REPOSITORY = Symbol('DRIVER_CASH_REPOSITORY');

export interface HandoverFilter {
  branchId?: UUID;
  driverId?: UUID;
  from?: Date;
  to?: Date;
}

export interface ResolvedAllocation {
  gatePassId: UUID;
  amount: number;
}

export interface HandoverWriteData {
  branchId: UUID;
  driverId: UUID | null;
  driverName: string;
  handoverDate: Date;
  amount: number;
  remarks: string | null;
  accountId: UUID | null;
  allocations: ResolvedAllocation[];
}

/** Port for money moving from the driver's pocket to the counter. */
export interface DriverCashRepository {
  /** Branch-wise: each branch counts its own series. See NUMBER_SERIES.md. */
  nextHandoverNumber(branchId?: UUID): Promise<string>;
  list(query: PaginationQuery, filter: HandoverFilter): Promise<Paginated<DriverCashHandoverItem>>;
  findById(id: UUID): Promise<DriverCashHandoverItem | null>;
  /**
   * Records the handover and moves each named trip's cash-in by what it settled, in one
   * transaction — a handover written without its trips would leave a driver owing money
   * he had already paid.
   */
  create(
    number: string,
    data: HandoverWriteData,
    receivedBy: UUID,
    receivedByName: string,
  ): Promise<DriverCashHandoverItem>;
  /** Takes the money back off the trips and removes the handover. */
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;

  /** What a driver still owes, trip by trip, oldest first. */
  driverDue(driverId: UUID | null, driverName: string, branchId?: UUID): Promise<DriverDueSummary>;
  /** Every driver carrying a balance — the list the counter works through. */
  outstandingDrivers(branchId?: UUID): Promise<DriverDueSummary[]>;
}
