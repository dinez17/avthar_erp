import { ValidationError } from '@tiles-erp/shared';
import {
  allocateOldestFirst,
  assertAdvance,
  assertDestination,
  assertEditable,
  assertNotOverloaded,
  assertOdometer,
  assertTransition,
  cashVariance,
  cashWithDriver,
  commonCustomer,
  dispatchStatusOf,
  freightMargin,
  freightOutstanding,
  freightToCollect,
  movesStock,
  shortQty,
  tripDistance,
} from './dispatch.rules';

describe('assertTransition', () => {
  it('walks the pass forward through its lifecycle', () => {
    expect(() => assertTransition('DRAFT', 'LOADED')).not.toThrow();
    expect(() => assertTransition('LOADED', 'GATED_OUT')).not.toThrow();
    expect(() => assertTransition('GATED_OUT', 'DELIVERED')).not.toThrow();
    expect(() => assertTransition('DELIVERED', 'CLOSED')).not.toThrow();
  });

  it('closes a returned vehicle even when the delivery paperwork is not in', () => {
    expect(() => assertTransition('GATED_OUT', 'CLOSED')).not.toThrow();
  });

  it('leaves a closed trip alone', () => {
    expect(() => assertTransition('CLOSED', 'CANCELLED')).toThrow(ValidationError);
    expect(() => assertTransition('CLOSED', 'GATED_OUT')).toThrow(ValidationError);
  });

  it('lets a checked load be sent back to draft for correction', () => {
    expect(() => assertTransition('LOADED', 'DRAFT')).not.toThrow();
  });

  it('refuses to skip the gate', () => {
    expect(() => assertTransition('DRAFT', 'GATED_OUT')).toThrow(ValidationError);
    expect(() => assertTransition('LOADED', 'DELIVERED')).toThrow(ValidationError);
  });

  it('will not reopen a vehicle that has already left', () => {
    expect(() => assertTransition('GATED_OUT', 'DRAFT')).toThrow(ValidationError);
  });

  it('refuses to cancel a delivered pass — that is a sales return, not an edit', () => {
    expect(() => assertTransition('DELIVERED', 'CANCELLED')).toThrow(/cannot be cancelled/);
  });

  it('leaves a cancelled pass alone', () => {
    expect(() => assertTransition('CANCELLED', 'DRAFT')).toThrow(ValidationError);
  });
});

describe('assertEditable', () => {
  it('allows a draft to be changed', () => {
    expect(() => assertEditable('DRAFT')).not.toThrow();
  });

  it('refuses once the load has been checked', () => {
    expect(() => assertEditable('LOADED')).toThrow(/Only a draft/);
    expect(() => assertEditable('GATED_OUT')).toThrow(/gated out/);
  });
});

describe('movesStock', () => {
  it('is true only for a sample, which has no document behind it', () => {
    expect(movesStock('SAMPLE')).toBe(true);
  });

  it('is false where the invoice or transfer already moved the stock', () => {
    expect(movesStock('SALES')).toBe(false);
    expect(movesStock('TRANSFER')).toBe(false);
  });
});

describe('assertDestination', () => {
  it('wants a branch for a transfer and a customer for a sample', () => {
    expect(() => assertDestination('TRANSFER', { toBranchId: 'b1' })).not.toThrow();
    expect(() => assertDestination('SAMPLE', { customerId: 'c1' })).not.toThrow();
  });

  it('refuses a transfer with no destination branch', () => {
    expect(() => assertDestination('TRANSFER', { customerId: 'c1' })).toThrow(/branch/);
  });

  it('refuses a sample with no customer — nothing else names one for it', () => {
    expect(() => assertDestination('SAMPLE', {})).toThrow(/customer/);
  });

  it('asks a sales pass for nothing: its invoices say whose the goods are', () => {
    expect(() => assertDestination('SALES', {})).not.toThrow();
    expect(() => assertDestination('SALES', { customerId: 'c1' })).not.toThrow();
  });
});

describe('commonCustomer', () => {
  it('names the customer when the whole load is for one of them', () => {
    expect(commonCustomer(['c1', 'c1'])).toBe('c1');
  });

  it('names nobody on a round with several drops', () => {
    expect(commonCustomer(['c1', 'c2'])).toBeNull();
  });

  it('names nobody when part of the load has no customer at all', () => {
    expect(commonCustomer(['c1', null])).toBeNull();
  });

  it('names nobody for an empty pass', () => {
    expect(commonCustomer([])).toBeNull();
  });
});

describe('assertNotOverloaded', () => {
  it('allows a short load — the lorry filled up', () => {
    expect(() => assertNotOverloaded([{ docQtyBoxes: 100, qtyBoxes: 60 }])).not.toThrow();
  });

  it('allows the exact quantity', () => {
    expect(() => assertNotOverloaded([{ docQtyBoxes: 100, qtyBoxes: 100 }])).not.toThrow();
  });

  it('refuses more than the document says', () => {
    expect(() => assertNotOverloaded([{ docQtyBoxes: 100, qtyBoxes: 101 }])).toThrow(
      ValidationError,
    );
  });

  it('leaves a sample line alone — it has no document to exceed', () => {
    expect(() => assertNotOverloaded([{ docQtyBoxes: 0, qtyBoxes: 5 }])).not.toThrow();
  });

  it('is not tripped by a rounding remainder', () => {
    expect(() => assertNotOverloaded([{ docQtyBoxes: 10.25, qtyBoxes: 10.2501 }])).not.toThrow();
  });
});

describe('shortQty', () => {
  it('reports how far short the load fell', () => {
    expect(shortQty(100, 60)).toBe(40);
  });

  it('is zero for a full load and for a sample', () => {
    expect(shortQty(100, 100)).toBe(0);
    expect(shortQty(0, 5)).toBe(0);
  });
});

describe('dispatchStatusOf', () => {
  it('is pending when nothing has left', () => {
    expect(dispatchStatusOf([{ qtyBoxes: 10, dispatchedQtyBoxes: 0 }])).toBe('PENDING');
  });

  it('is dispatched when every line went out in full', () => {
    expect(
      dispatchStatusOf([
        { qtyBoxes: 10, dispatchedQtyBoxes: 10 },
        { qtyBoxes: 4, dispatchedQtyBoxes: 4 },
      ]),
    ).toBe('DISPATCHED');
  });

  it('is partial when one line is complete and another is not', () => {
    expect(
      dispatchStatusOf([
        { qtyBoxes: 10, dispatchedQtyBoxes: 10 },
        { qtyBoxes: 4, dispatchedQtyBoxes: 0 },
      ]),
    ).toBe('PARTIAL');
  });

  it('does not let the totals disguise an undelivered line', () => {
    // 14 boxes out of 14 in total, but the second line never went.
    expect(
      dispatchStatusOf([
        { qtyBoxes: 10, dispatchedQtyBoxes: 14 },
        { qtyBoxes: 4, dispatchedQtyBoxes: 0 },
      ]),
    ).toBe('PARTIAL');
  });

  it('treats a three-decimal remainder as complete', () => {
    expect(dispatchStatusOf([{ qtyBoxes: 10.25, dispatchedQtyBoxes: 10.2496 }])).toBe('DISPATCHED');
  });

  it('reads an invoice with no lines as pending', () => {
    expect(dispatchStatusOf([])).toBe('PENDING');
  });
});

describe('freightMargin', () => {
  it('is what the customers were charged less what the trip cost', () => {
    expect(freightMargin(3000, 2200)).toBe(800);
  });

  it('goes negative when the trip was made at a loss', () => {
    expect(freightMargin(1000, 2200)).toBe(-1200);
  });
});

describe('freightToCollect', () => {
  it('is the part the invoice did not already cover', () => {
    expect(freightToCollect(1500, 500)).toBe(1000);
  });

  it('is nothing when the invoice already billed the freight', () => {
    expect(freightToCollect(1500, 1500)).toBe(0);
  });

  it('never goes negative — over-billing is settled on the ledger, not at the door', () => {
    expect(freightToCollect(500, 1500)).toBe(0);
  });

  it('is the whole charge when the invoice billed none', () => {
    expect(freightToCollect(1500, 0)).toBe(1500);
  });

  it('drops to nothing once the customer pays at the counter', () => {
    expect(freightToCollect(1500, 0, 1500)).toBe(0);
  });

  it('asks only for the remainder after a part payment at the counter', () => {
    expect(freightToCollect(1500, 200, 300)).toBe(1000);
  });
});

describe('freightOutstanding', () => {
  it('is nothing when the driver collected it all', () => {
    expect(freightOutstanding(1000, 1000)).toBe(0);
  });

  it('is what the driver came back without', () => {
    expect(freightOutstanding(1000, 600)).toBe(400);
  });

  it('never goes negative when the driver collected more than was due', () => {
    expect(freightOutstanding(1000, 1200)).toBe(0);
  });
});

describe('tripDistance', () => {
  it('is the difference between the two gate readings', () => {
    expect(tripDistance(84210, 84346)).toBe(136);
  });

  it('is unknown until the vehicle is back', () => {
    expect(tripDistance(84210, null)).toBeNull();
    expect(tripDistance(null, null)).toBeNull();
  });
});

describe('assertOdometer', () => {
  it('accepts a reading that has moved forward', () => {
    expect(() => assertOdometer(84210, 84346)).not.toThrow();
  });

  it('accepts a vehicle that went nowhere', () => {
    expect(() => assertOdometer(84210, 84210)).not.toThrow();
  });

  it('refuses a closing reading below the opening one', () => {
    expect(() => assertOdometer(84210, 8434)).toThrow(ValidationError);
  });

  it('says nothing when a reading is missing', () => {
    expect(() => assertOdometer(null, 84346)).not.toThrow();
    expect(() => assertOdometer(84210, null)).not.toThrow();
  });
});

describe('cashWithDriver', () => {
  it('is what he took less what has reached the counter', () => {
    expect(cashWithDriver(2500, 1000)).toBe(1500);
  });

  it('is nothing once he has settled', () => {
    expect(cashWithDriver(2500, 2500)).toBe(0);
  });

  it('never goes negative when more was handed in than the trips account for', () => {
    expect(cashWithDriver(2500, 3000)).toBe(0);
  });
});

describe('allocateOldestFirst', () => {
  const trips = [
    { gatePassId: 'a', balance: 1000 },
    { gatePassId: 'b', balance: 500 },
    { gatePassId: 'c', balance: 800 },
  ];

  it('clears the oldest trip first', () => {
    expect(allocateOldestFirst(1000, trips)).toEqual([{ gatePassId: 'a', amount: 1000 }]);
  });

  it('spills over into the next trip', () => {
    expect(allocateOldestFirst(1300, trips)).toEqual([
      { gatePassId: 'a', amount: 1000 },
      { gatePassId: 'b', amount: 300 },
    ]);
  });

  it('clears everything when the driver settles in full', () => {
    expect(allocateOldestFirst(2300, trips)).toEqual([
      { gatePassId: 'a', amount: 1000 },
      { gatePassId: 'b', amount: 500 },
      { gatePassId: 'c', amount: 800 },
    ]);
  });

  it('stops at what the trips owe, never allocating more', () => {
    const allocations = allocateOldestFirst(5000, trips);
    expect(allocations.reduce((sum, each) => sum + each.amount, 0)).toBe(2300);
  });

  it('allocates nothing for nothing', () => {
    expect(allocateOldestFirst(0, trips)).toEqual([]);
  });

  it('skips a trip with nothing on it', () => {
    expect(allocateOldestFirst(100, [{ gatePassId: 'a', balance: 0 }, ...trips])).toEqual([
      { gatePassId: 'a', amount: 100 },
    ]);
  });
});

describe('cashVariance', () => {
  it('is zero when the cash matches the drops', () => {
    expect(cashVariance(2500, 2500)).toBe(0);
  });

  it('is negative when the driver is short', () => {
    expect(cashVariance(2000, 2500)).toBe(-500);
  });

  it('is positive when he hands over more than the drops account for', () => {
    expect(cashVariance(2600, 2500)).toBe(100);
  });
});

describe('assertAdvance', () => {
  it('allows an advance up to the hire charge', () => {
    expect(() => assertAdvance(2000, 2000)).not.toThrow();
    expect(() => assertAdvance(2000, 500)).not.toThrow();
  });

  it('refuses paying out more than was agreed', () => {
    expect(() => assertAdvance(2000, 2500)).toThrow(/more than the hire charge/);
  });
});
