# Sales orders and stock reservation

A sales order is the commitment to sell. It sits between the quotation (a price offer)
and the invoice (the actual sale), and it is the point where stock stops being free.

## Lifecycle

```
Quotation (ACCEPTED)
        │  convert
        ▼
   DRAFT ──confirm──► CONFIRMED ──invoice──► PARTIALLY_INVOICED ──► INVOICED
     │                    │
     └──delete            └──cancel──► CANCELLED  (reservations released)
```

- **DRAFT** — editable, holds no stock. It can be deleted outright.
- **CONFIRMED** — stock is reserved. The order can only be cancelled, not deleted.
- **PARTIALLY_INVOICED / INVOICED** — set by the invoicing sprint as reservations are
  consumed. Neither can be cancelled.
- **CANCELLED** — every active reservation is released back to free stock in the same
  transaction that cancels the order.

## Reservations never touch stock balances

`CLAUDE.md` requires that stock only ever moves through the movement ledger. A reserved
box has not moved anywhere — it is still physically in the godown — so reservations live
in their own table:

```
free stock = stock_balances.qtyBoxes − Σ ACTIVE stock_reservations.qtyBoxes
```

for the same stock key (product, branch, godown, gate, batch, shade). No `StockMovement`
is written on confirm, and `stock_balances` is untouched. The SALE movements are written
later, when an invoice is raised.

`GET /sales-orders/available-stock?branchId=…&productIds=…` returns that arithmetic per
godown so the UI can show what is genuinely promisable.

## Allocation on confirm

`planReservations` walks each order line against the free stock of its branch, taking
from godowns in balance order — oldest batch first — and splitting across godowns when
no single one holds enough. Two lines for the same product cannot be promised the same
boxes: the plan decrements its own running pool as it goes.

### Seeing it earlier

A shortage found at confirmation time is a shortage found too late — the customer has
already been quoted. The quotation entry screen therefore shows a **Free stock** column
per line, from the same `on hand − active reservations` arithmetic, and warns above the
grid when a quoted quantity exceeds it.

Quoting more than is in stock is still allowed — the goods may be on order, or the
customer may be happy to wait — but nobody promises it unknowingly.

If a line cannot be filled, confirmation fails with the exact shortfall:

> Kajaria IVR is short by 7 box in this branch. Transfer stock in or reduce the order.

Nothing is written when the plan fails, so the order stays a draft.

## Credit control

Confirming checks the customer's exposure:

```
committed value (other CONFIRMED / PARTIALLY_INVOICED orders) + this order's total
        ≤ customer.creditLimit
```

A limit of zero means "no limit set" and is not enforced. A user holding
`customer:creditApprove` (or `SUPER_ADMIN`) may confirm past the limit; everyone else
gets a message naming the exposure and the limit.

## Pricing

Order lines are priced exactly like quotation lines — the branch selling price is the
default, and the branch **minimum** selling price is a floor unless the user holds
`quotation:overridePrice`. Converting a quotation carries its approved rates over as
quoted, since they were already approved on the quotation.

Quantities may be entered as boxes plus loose pieces or as a decimal box figure, and a
salesperson always credits their own orders (see `Role.isSalesRole`).

## API

| Method | Path                                         | Permission              |
| ------ | -------------------------------------------- | ----------------------- |
| GET    | `/sales-orders`                              | `salesOrder:read`       |
| GET    | `/sales-orders/available-stock`              | `salesOrder:read`       |
| GET    | `/sales-orders/:id`                          | `salesOrder:read`       |
| GET    | `/sales-orders/:id/reservations`             | `salesOrder:read`       |
| POST   | `/sales-orders`                              | `salesOrder:create`     |
| POST   | `/sales-orders/from-quotation/:quotationId`  | `salesOrder:create`     |
| PATCH  | `/sales-orders/:id`                          | `salesOrder:update`     |
| PATCH  | `/sales-orders/:id/confirm`                  | `salesOrder:confirm`    |
| PATCH  | `/sales-orders/:id/cancel`                   | `salesOrder:cancel`     |
| DELETE | `/sales-orders/:id`                          | `salesOrder:delete`     |

Every write takes the `version` the client last read and fails with a conflict if the
order moved on in the meantime.

## Walk-ins become customers when the quote is accepted

Orders need a customer master record, because credit control and the ledger both hang off
it — but a quotation taken at the counter often names a walk-in who was never registered.

**Accepting the quote is the moment they become a customer, so that is when the record is
made.** The walk-in's name, phone and address come off the quotation; the quotation is
linked to the new record; and the acceptance message says so, because the clerk asked to
accept a quote and got a master record as well.

The match is on the **last ten digits of the phone**. A counter writes the same number a
dozen ways — `98765 43210`, `+91 9876543210`, `098765-43210` — so `normalisePhone` in
`application/walk-in.ts` strips everything but the digits before looking. The same person
quoted twice lands on the same account rather than collecting a second one. Matching and
creating happen in one transaction, so two clerks accepting quotes for the same walk-in at
the same moment cannot create two records.

**A phone number is therefore required**, and it is the only field that is. Without one
there is nothing to tell this walk-in from the next, and the master would gain a fresh
"Ramesh" every time somebody of that name asked for a price. Accepting without one is
refused, and the status does not move — a quote that cannot be registered should not sit
accepted with nobody to order for.

The new record is created with **no credit**: a walk-in buys over the counter until
somebody decides otherwise. It is noted as "Created from an accepted quotation" so it can
be told apart from one entered deliberately.

## Converting a quotation

Only an **ACCEPTED** quotation converts, and by then it has a customer. The convert dialog
can still name a different one — occasionally the walk-in turns out to be buying for a
registered firm — and the guard against converting with no customer at all stays as a
safety net for quotes accepted before this behaviour existed.

The quotation is marked `CONVERTED` in the same transaction, and the order keeps a link
back to it (`quotationId`, unique, so a quotation converts once).


## Cross-branch orders

An order may be allowed to draw stock from other branches, which turns it into one invoice
per supplying branch. It is off by default and decided at confirmation. See
[SPLIT_INVOICE.md](SPLIT_INVOICE.md).
