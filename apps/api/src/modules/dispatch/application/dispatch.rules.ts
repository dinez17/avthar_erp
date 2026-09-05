import { ValidationError } from '@tiles-erp/shared';
import type { DispatchStatus, GatePassStatus, GatePassType } from '@tiles-erp/shared-types';

/** Quantities are held to three decimals; anything smaller is float noise. */
const EPSILON = 0.0005;

export const round3 = (value: number): number => Math.round(value * 1000) / 1000;
export const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The gate pass lifecycle.
 *
 * ```
 * DRAFT ──load──► LOADED ──gateOut──► GATED_OUT ──deliver──► DELIVERED
 *   │                │                    │
 *   └────────────────┴────cancel──────────┘
 * ```
 *
 * A pass cannot be cancelled once delivered: the goods are with the customer and the
 * document is the evidence of that. Reversing a delivery is a sales return, not an edit.
 */
const TRANSITIONS: Record<GatePassStatus, GatePassStatus[]> = {
  DRAFT: ['LOADED', 'CANCELLED'],
  LOADED: ['GATED_OUT', 'DRAFT', 'CANCELLED'],
  // The vehicle can come back and be closed whether or not the delivery paperwork is
  // done: the gate reads the odometer when the lorry arrives, not when the file does.
  GATED_OUT: ['DELIVERED', 'CLOSED', 'CANCELLED'],
  DELIVERED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function assertTransition(from: GatePassStatus, to: GatePassStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new ValidationError(`A ${from.toLowerCase().replace('_', ' ')} gate pass cannot be ${verb(to)}`);
  }
}

const verb = (status: GatePassStatus): string =>
  ({
    DRAFT: 'reopened',
    LOADED: 'marked loaded',
    GATED_OUT: 'gated out',
    DELIVERED: 'marked delivered',
    CLOSED: 'closed',
    CANCELLED: 'cancelled',
  })[status];

/** Only a draft can have its contents changed; after that the load has been checked. */
export function assertEditable(status: GatePassStatus): void {
  if (status !== 'DRAFT') {
    throw new ValidationError(
      `Only a draft gate pass can be edited (this one is ${status.toLowerCase().replace('_', ' ')})`,
    );
  }
}

/**
 * Does gating this pass out move stock?
 *
 * For SALES the invoice already wrote the SALE movements, and for TRANSFER the transfer
 * wrote its pair — a second movement would take the goods out twice. A SAMPLE has no
 * document behind it, so the pass is the only record that the stock left.
 */
export function movesStock(type: GatePassType): boolean {
  return type === 'SAMPLE';
}

/**
 * Where the pass is going, and what must therefore be filled in.
 *
 * A SALES pass names no customer of its own: one lorry on a delivery round drops at
 * several, and each invoice aboard carries its own. A SAMPLE has no document to carry
 * one, so it must be told; a TRANSFER goes to a branch.
 */
export function assertDestination(
  type: GatePassType,
  destination: { customerId?: string | null; toBranchId?: string | null },
): void {
  if (type === 'TRANSFER' && !destination.toBranchId) {
    throw new ValidationError('Choose the branch the goods are going to');
  }
  if (type === 'SAMPLE' && !destination.customerId) {
    throw new ValidationError('Choose the customer the sample is going to');
  }
}

export interface LoadedLine {
  docQtyBoxes: number;
  qtyBoxes: number;
}

/**
 * A line may be loaded short — the lorry filled up, or a batch ran out — but never over.
 * Loading more than the invoice says would put goods on the road that nothing accounts
 * for, and it is the one difference the gate cannot wave through.
 */
export function assertNotOverloaded(lines: LoadedLine[]): void {
  for (const line of lines) {
    if (line.docQtyBoxes > 0 && line.qtyBoxes > line.docQtyBoxes + EPSILON) {
      throw new ValidationError(
        `Cannot load ${round3(line.qtyBoxes)} boxes against a document line of ${round3(line.docQtyBoxes)}`,
      );
    }
  }
}

/** How far short of its document a line was loaded; zero when it went in full. */
export function shortQty(docQtyBoxes: number, qtyBoxes: number): number {
  if (docQtyBoxes <= 0) return 0;
  return Math.max(0, round3(docQtyBoxes - qtyBoxes));
}

/**
 * Where an invoice stands once its dispatched quantities are known.
 *
 * The comparison is per line, not on the total: an invoice whose first line went in full
 * and whose second did not has not been dispatched, however the box counts happen to add
 * up.
 */
export function dispatchStatusOf(
  lines: { qtyBoxes: number; dispatchedQtyBoxes: number }[],
): DispatchStatus {
  if (lines.length === 0) return 'PENDING';
  const anyOut = lines.some((line) => line.dispatchedQtyBoxes > EPSILON);
  if (!anyOut) return 'PENDING';
  const allOut = lines.every((line) => line.dispatchedQtyBoxes >= line.qtyBoxes - EPSILON);
  return allOut ? 'DISPATCHED' : 'PARTIAL';
}

/**
 * What a round earned or cost: what the customers were charged for freight, less the hire
 * paid out. Negative means the trip was made at a loss, which is worth seeing on the list.
 */
export function freightMargin(chargedFreight: number, hireCharge: number): number {
  return round2(chargedFreight - hireCharge);
}

/**
 * What is actually due at the door for one drop.
 *
 * Where the invoice already billed freight, or the customer settled at the counter, the
 * delivery is paid for and asking again at the door is a dispute. So what the driver
 * collects is only the remainder — and never a negative, because over-billing is settled
 * on the ledger, not out of the driver's pocket.
 */
export function freightToCollect(
  freightCharge: number,
  billedFreight: number,
  paidAtBranch = 0,
): number {
  return Math.max(0, round2(freightCharge - billedFreight - paidAtBranch));
}

/** What a drop still owes once the driver is back and the collection is recorded. */
export function freightOutstanding(toCollect: number, collected: number): number {
  return Math.max(0, round2(toCollect - collected));
}

/**
 * The distance the round covered.
 *
 * Null until the vehicle is back, because half a reading is not a distance.
 */
export function tripDistance(startKm: number | null, endKm: number | null): number | null {
  if (startKm === null || endKm === null) return null;
  return endKm - startKm;
}

/**
 * The odometer only goes forwards.
 *
 * A reading below the one taken on the way out is a typo — a digit dropped, or the trip
 * meter read instead of the odometer — and it is worth catching at the gate rather than
 * discovering it in a fuel report next month.
 */
export function assertOdometer(startKm: number | null, endKm: number | null): void {
  if (startKm === null || endKm === null) return;
  if (endKm < startKm) {
    throw new ValidationError(
      `The closing reading (${endKm} km) is below the one taken on the way out (${startKm} km)`,
    );
  }
}

/**
 * What the cash count disagrees with the drops about.
 *
 * Positive means the driver handed over more than the drops account for, negative means
 * less. Neither is refused — the desk records what it counted, and the difference is the
 * thing worth looking at.
 */
export function cashVariance(cashHandedOver: number, collected: number): number {
  return round2(cashHandedOver - collected);
}

/** What the driver is still carrying for a trip: taken at the door, not yet handed in. */
export function cashWithDriver(collected: number, handedOver: number): number {
  return Math.max(0, round2(collected - handedOver));
}

/**
 * Spreads a handover across the trips the driver still owes on, oldest first.
 *
 * A driver settling at the end of the day hands over one sum for three runs; asking which
 * trip each note came from is theatre. Oldest first is what a counter does, and it means
 * the trip that has been open longest closes first.
 */
export function allocateOldestFirst(
  amount: number,
  trips: { gatePassId: string; balance: number }[],
): { gatePassId: string; amount: number }[] {
  let remaining = round2(amount);
  const allocations: { gatePassId: string; amount: number }[] = [];

  for (const trip of trips) {
    if (remaining <= 0.005) break;
    const applied = round2(Math.min(trip.balance, remaining));
    if (applied <= 0) continue;
    allocations.push({ gatePassId: trip.gatePassId, amount: applied });
    remaining = round2(remaining - applied);
  }

  return allocations;
}

/** An advance handed to the driver cannot exceed the hire agreed with the transporter. */
export function assertAdvance(hireCharge: number, advancePaid: number): void {
  if (advancePaid > hireCharge + 0.005) {
    throw new ValidationError('The advance is more than the hire charge');
  }
}

/**
 * The header customer for a pass, which is a label rather than a constraint: it is set
 * only when every document aboard names the same one, and left empty for a delivery round
 * so nothing on screen claims a lorry is going somewhere it is only partly going.
 */
export function commonCustomer(customerIds: (string | null)[]): string | null {
  const named = customerIds.filter((id): id is string => id !== null);
  if (named.length === 0 || named.length !== customerIds.length) return null;
  return named.every((id) => id === named[0]) ? named[0]! : null;
}
