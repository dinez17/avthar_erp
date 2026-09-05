import type { UUID } from '@tiles-erp/shared-types';

export const GATE_PASS_SOURCE = Symbol('GATE_PASS_SOURCE');

export interface DispatchableInvoice {
  id: UUID;
  invoiceNumber: string;
  invoiceDate: Date;
  customerId: UUID;
  customerName: string;
  customerAddress: string | null;
  branchId: UUID;
  grandTotal: number;
  freightCharge: number;
}

export interface DispatchableTransfer {
  id: UUID;
  transferNo: string;
  transferDate: Date;
}

export interface DispatchProduct {
  id: UUID;
  sku: string;
  piecesPerBox: number;
}

export interface DispatchVehicle {
  id: UUID;
  number: string;
  transporterId: UUID | null;
}

export interface DispatchDriver {
  id: UUID;
  name: string;
  phone: string;
  transporterId: UUID | null;
}

/**
 * What building a gate pass needs to read but does not own.
 *
 * Keeping it behind a port is what lets the pass-building rules be tested without a
 * database, and stops the dispatch module reaching into the sales module's repository.
 */
export interface GatePassSource {
  /** A posted invoice, or null when it is missing, a draft or cancelled. */
  invoiceForDispatch(id: UUID): Promise<DispatchableInvoice | null>;
  transferForDispatch(id: UUID): Promise<DispatchableTransfer | null>;
  productForLine(id: UUID): Promise<DispatchProduct | null>;
  vehicle(id: UUID): Promise<DispatchVehicle | null>;
  driver(id: UUID): Promise<DispatchDriver | null>;
  transporter(id: UUID): Promise<{ id: UUID; name: string } | null>;
}
