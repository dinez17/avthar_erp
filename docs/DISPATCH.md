# Dispatch: gate pass, loading and proof of delivery

An invoice says what was sold. A gate pass says what actually left the yard, on which
vehicle, and whether it arrived.

## Why it is a separate document

One lorry commonly carries several invoices — often for **several customers** on one round
— and one invoice is sometimes loaded over two trips. Neither fits on the invoice itself,
so the pass sits between them: it points at the documents travelling, and carries its own
lines for what was put on the vehicle.

## One pass, many customers

A delivery round is the ordinary case, so the **customer lives on the document, not on the
pass**. Each `GatePassDocument` records whose invoice it is, the address for that drop, and
its place in the sequence; the driver's copy prints as a block per drop, in the order they
are made.

The pass header keeps a `customerId` as a **label only**: it is filled in when every
invoice aboard happens to be for the same customer, and left empty for a round rather than
claiming the lorry is going to whichever drop happened to be first. `commonCustomer` in
`application/dispatch.rules.ts` is that rule, and the list shows "Karthik Traders +2" so
nothing on screen pretends otherwise.

Because the header may name nobody, filtering by customer looks at the **documents**, and
so does the search box.

The one constraint that remains is the branch: every invoice on a pass must belong to the
branch the goods are leaving from. Stock leaves a godown, and a godown belongs to a branch.

## Lifecycle

```
DRAFT ──load──► LOADED ──gateOut──► GATED_OUT ──deliver──► DELIVERED
  │                │                    │                      │
  │                │                    └──────close───────────┴──► CLOSED
  └────────────────┴──────cancel────────┘
```

Each step is a different person's job, which is why each is a separate permission:

| Step           | Who does it        | Permission          |
| -------------- | ------------------ | ------------------- |
| Build a pass   | Dispatch clerk     | `gatePass:create`   |
| Confirm load   | Loading supervisor | `gatePass:load`     |
| Let it out     | Security desk      | `gatePass:gateOut`  |
| Record the POD | Driver's return    | `gatePass:deliver`  |
| Close the trip | Gate, on return    | `gatePass:close`    |

A **delivered** pass cannot be cancelled. The goods are with the customer and the pass is
the evidence of it; reversing that is a sales return, not an edit. A **loaded** pass can be
sent back to draft, because catching a mistake before the vehicle leaves is the point of
the check. A **closed** trip is final.

A vehicle can be closed straight from `GATED_OUT` without passing through `DELIVERED`: the
gate reads the odometer when the lorry arrives, not when the delivery paperwork does.

## Closing the trip

Three things are recorded together when the vehicle comes back through the gate, because
they belong together — doing them as separate steps would leave a trip half-closed the
moment the desk got interrupted:

**The odometer.** Read at the gate on the way out (`startKm`) and again on the way in
(`endKm`), both by the gate rather than by the driver — that is the point of them. A
closing reading below the opening one is refused: it means a digit was dropped or the trip
meter was read instead of the odometer, and it is cheaper to catch at the gate than in a
fuel report next month. `tripKm` is the difference, and stays null until both are in.

**What each drop settled.** Two figures per customer:

- `freightPaidAtBranch` — settled at the counter, often while the lorry was out. It
  reduces what the driver should have asked for.
- `freightCollected` — what he actually took at the door.

Whatever is left is `freightOutstanding`, and the pass carries the total so a round that
came back with money uncollected says so.

**The cash, if it is handed over there and then.** Optional — see below.

Each drop is pre-filled with what it was expected to collect — the driver was sent to get
it, so assuming he did is the fast path, and correcting one figure beats typing them all.

## Driver cash: from his pocket to the counter

The cash and the vehicle arrive at different times. A trip closes at the gate when the
lorry is back; the driver settles at the counter afterwards, often for three runs at once
at the end of the day. Between the two he is carrying the firm's money, and **that balance
is the thing worth being able to see** — so the handover is its own document.

- **`freightCollected`** (per drop) — what he took at the door. He owes this.
- **`cashHandedOver`** (per trip) — how much of it has reached the counter. A **projection**
  of the handover lines, never typed on its own.
- The difference is what he is still carrying: `cashWithDriver`.

The **Driver cash** page has two halves, because a driver's balance is a live question and
a handover is a closed one. The top lists everyone carrying money, with a **Take cash**
button; the bottom lists what has already come in.

Taking cash asks for **one figure, not one per trip**. A driver handing over ₹2,247 for
three runs is not going to say which note came from which, so `allocateOldestFirst` clears
the oldest trip first — what a counter does — and the split is shown before it is saved.
An explicit allocation is accepted where the API is driven directly, and must add up to the
amount.

Cash counted at the **gate** during close is not a special case: it creates a handover like
any other, so there is one record of money changing hands whether it happened at the gate
or an hour later at the counter.

A handover can be **reversed**, which puts the money back on the trips. That is the only
correction: the record of what came in stays.

## What a pass can carry

| Type         | What travels                              | Names a customer         | Moves stock? |
| ------------ | ----------------------------------------- | ------------------------ | ------------ |
| **SALES**    | Posted invoices, for any number of buyers | Per document             | No           |
| **TRANSFER** | A stock transfer to another godown        | No — it goes to a branch | No           |
| **SAMPLE**   | Goods with no invoice at all              | On the header            | **Yes**      |

A sample is the one kind that must be told where it is going: there is no document to say.

The asymmetry is deliberate and is the single most important rule in this module. A posted
invoice already wrote its `SALE` movements and a transfer already wrote its
`TRANSFER_OUT`/`TRANSFER_IN` pair — writing another at the gate would take the same boxes
out of stock twice. A sample has no document behind it, so the pass is the only record that
the goods left, and gating it out writes `SAMPLE_OUT` (with the same balance check a sale
gets: you cannot send out stock that is not there).

Samples are **returnable** by default. When they come back, `SAMPLE_IN` puts them back at
the same godown, batch and shade they left from.

Only **posted** invoices can be dispatched. A draft has not taken the stock out yet and a
cancelled one never did; letting either through the gate would put goods on the road that
the ledger says are still in the godown.

## Loading, and short loads

Each pass line records what its document expects (`docQtyBoxes`) alongside what was
actually loaded (`qtyBoxes`).

The entry screen is built the way a round is planned: branch, transporter, vehicle, driver
and then **customers**, all in one row, because the lorry and its drops are one decision.

The customer control is a **multi-select** listing everyone with goods waiting at that
branch — drawn from the pending invoices, not the customer master, so it only offers the
ones a pass could actually be raised for, each with its invoice count and boxes waiting.
Their invoices appear underneath, one block per customer, numbered in the order they were
picked. Removing a customer takes their invoices back off the pass; an unticked customer
quietly riding along is exactly the mistake to avoid.

Within a customer, one tick takes **all of their invoices** (the checkbox goes
indeterminate when only part of the drop is aboard), and each invoice can still be opened
to adjust a line. The loaded quantity defaults to everything still pending, because a full
load is the common case and a short one is the exception worth typing. The order the
invoices were ticked becomes the drop sequence on the printed pass.

**Short is allowed. Over is not.** The lorry filling up or a batch running out is ordinary,
and the invoice simply stays part-dispatched until the rest follows on another pass.
Loading *more* than the document says would put goods on the road that nothing accounts
for, and it is the one difference the gate cannot wave through.

## What the invoice knows

Gating a pass out increments `dispatchedQtyBoxes` on each matching invoice line and
recomputes the invoice's `dispatchStatus`:

| Status         | Meaning                                    |
| -------------- | ------------------------------------------ |
| `PENDING`      | Nothing has left                           |
| `PARTIAL`      | Some lines are out, or some went short     |
| `DISPATCHED`   | Every line has left in full                |

The comparison is **per line, never on the total**. An invoice whose first line went in
full and whose second never moved is `PARTIAL`, however the box counts happen to add up —
`dispatchStatusOf` in `application/dispatch.rules.ts` is where that is enforced, and it is
tested against exactly that case.

A pass line is matched back to its invoice line by the stock it came from: the same product
out of the same godown, batch and shade. Cancelling a gated-out pass runs the same
arithmetic with the sign flipped, so the invoice goes back to waiting.

## Freight, charged per customer

What we pay for the lorry and what each customer pays for their delivery are different
numbers, and on a round the second is several numbers.

**Per drop**, on the document:

- **`freightCharge`** — what that customer is charged. **Typed, not apportioned**: the rate
  is agreed with the customer and has nothing to do with what the lorry happened to cost.
  It defaults to whatever their invoice already billed, so a pass raised without thinking
  about freight behaves exactly as it did before.
- **`billedFreight`** — what their invoice already billed, copied at the time.
- **`freightToCollect`** — the difference, and never negative. Where the invoice already
  covered the freight the customer has paid for the delivery, and asking again at the door
  is a dispute; where it billed less, the balance is to-pay. Over-billing on the invoice is
  settled on the ledger, not out of the driver's pocket.

**Per trip**, on the header:

- **`hireCharge`** — what the trip costs us, plus the `advancePaid` handed to the driver.
  The advance cannot exceed the hire, which catches the common typo of entering one in the
  other's box.
- **`chargedFreight`** — the drops added up.
- **`freightMargin`** — `chargedFreight - hireCharge`, shown on the list and turning red
  when the round was made at a loss. The entry screen warns before saving when the charges
  do not cover the hire, without refusing: a loss-making delivery is sometimes deliberate.

Nothing here is posted to the ledger. The gate pass records what was agreed and what the
driver should collect; billing it is the customer's invoice, not this document.

The driver's copy prints **"Freight to collect"** under each drop that has one, and a total
at the foot — the only money on a sheet that is otherwise quantity-only, and it is there
because the driver has to ask for it.

## The printed pass

Grouped **by drop**, in the order they are made: each block names the customer, the invoice
and the address for that stop, then the items. On a round the header cannot name one
destination, and this is the sheet the driver actually works from.

No rates, no invoice value. A gate pass travels with the goods and is handed to whoever
asks for it at a checkpoint, and what the load is worth is not their business. The one
exception is the freight to collect, printed per drop because the driver has to ask for it.
The hire charge appears on the A4 office copy alone.

A4, 80 mm and 58 mm, the same three sizes as everything else — see `PRINTING.md`.
Quantities use the app-wide box/pieces rule from `QUANTITY_DISPLAY.md`.

## Vehicle and driver

**The masters are the source.** The transporter, vehicle and driver are picked from
`/transporters`, `/vehicles` and `/drivers`; choosing a transporter narrows the other two
to its own, and choosing a vehicle or driver fills the transporter back in from whichever
of them carries one. An own vehicle belongs to no transporter, which is why leaving the
transporter blank lists every lorry rather than none.

The pass stores both the master ids **and a copy of the number and name**, taken at the
time it is built. The printed paper and any later dispute rely on the registration number,
not on a foreign key, and a vehicle later retired from the master must not blank out a pass
that has already gone out.

A hired lorry turning up unannounced is not in the master at all, so the number, driver and
phone can still be typed — but only when no vehicle was chosen. Where both are present the
master wins, because a typed number sitting beside a chosen lorry is a leftover, not an
intention.

## Reports

Four questions, four tabs on **Dispatch reports**, each fetched only when opened — every
one is a full sweep of the period's passes, so loading all four to read one would be three
wasted queries.

**Freight collection.** Per customer: charged, what the invoice already billed, paid at
the branch, collected by the driver, and what is still owed. Grouped by the customer on
the **document**, not the pass header, because a round carries several and the header
names none of them. Outstanding is summed per drop rather than from the customer's
totals — one drop settled twice over cannot pay for another that was never collected.

**Vehicle running.** Trips, kilometres, boxes, hire, freight earned, margin, and hire per
kilometre. Distance counts only trips with **both** odometer readings, and the trip count
carries an asterisk when some are missing: a cost per kilometre computed over half the
trips would flatter the lorry, so the report says what it is based on.

**Driver cash.** What each driver was sent to collect, what he took, what has reached the
counter, and what he is **still carrying**. Sorted by who is holding the most, because
that is what the report is opened to find. Only closed trips count. The live worklist is
the Driver cash page; this is the same figures over a period.

**Waiting to go.** Posted invoices with goods still in the godown, aged from the invoice
date into the same five buckets the receivables report uses (`ageingBucketFor` in
`@tiles-erp/shared`, shared so the two cannot drift). Deliberately **not** period-bound:
an invoice raised six weeks ago and never dispatched is exactly what this exists to
surface, and filtering it to "this month" would hide the rows that matter most. Value is
pro-rated by the quantity outstanding, since an invoice does not say what one box was
worth.

Cancelled and draft passes are excluded everywhere — nothing left the yard on one.

Every table exports to CSV, and the page prints.

### If a report looks empty

Two things to check, both of which bit this feature on the first run:

**The permission is new.** `dispatchReport:read` did not exist before these reports, so a
role granted its permissions earlier does not have it. `pnpm prisma:seed` re-grants the
full set to the admin roles. The page now prints the API's own message rather than a
generic line, so a missing permission says so instead of looking like a report with
nothing in it.

**The period must cover the whole day.** A date input gives back `2026-08-08`, which
`new Date()` reads as **midnight UTC** — so a period ending "today" excluded everything
that happened today, which in India is the entire working day. `startOfDayIso` and
`endOfDayIso` in `@tiles-erp/shared` read the day in the browser's own zone and stretch it
end to end. The same bug was silently present on the GST summary and the customer ledger;
all three now use the shared pair.

## API

| Method | Path                          | Permission           |
| ------ | ----------------------------- | -------------------- |
| GET    | `/gate-passes`                | `gatePass:read`      |
| GET    | `/gate-passes/pending`        | `gatePass:create`    |
| GET    | `/gate-passes/:id`            | `gatePass:read`      |
| GET    | `/gate-passes/:id/print`      | `gatePass:read`      |
| POST   | `/gate-passes`                | `gatePass:create`    |
| PATCH  | `/gate-passes/:id`            | `gatePass:update`    |
| PATCH  | `/gate-passes/:id/loaded`     | `gatePass:load`      |
| PATCH  | `/gate-passes/:id/gate-out`   | `gatePass:gateOut`   |
| PATCH  | `/gate-passes/:id/close`      | `gatePass:close`     |
| PATCH  | `/gate-passes/:id/deliver`    | `gatePass:deliver`   |
| PATCH  | `/gate-passes/:id/return`     | `gatePass:deliver`   |
| PATCH  | `/gate-passes/:id/cancel`     | `gatePass:cancel`    |
| DELETE | `/gate-passes/:id`            | `gatePass:delete`    |
| GET    | `/dispatch-reports/freight-collection` | `dispatchReport:read` |
| GET    | `/dispatch-reports/vehicles`  | `dispatchReport:read` |
| GET    | `/dispatch-reports/drivers`   | `dispatchReport:read` |
| GET    | `/dispatch-reports/pending-ageing` | `dispatchReport:read` |
| GET    | `/driver-cash/outstanding`    | `driverCash:read`    |
| GET    | `/driver-cash/due`            | `driverCash:read`    |
| GET    | `/driver-cash/handovers`      | `driverCash:read`    |
| GET    | `/driver-cash/handovers/:id`  | `driverCash:read`    |
| POST   | `/driver-cash/handovers`      | `driverCash:receive` |
| DELETE | `/driver-cash/handovers/:id`  | `driverCash:receive` |

`/gate-passes/pending` is registered **before** `/gate-passes/:id`. A literal path under
the same prefix has to come first, or the id parser answers it and rejects the word
"pending" — the same collision that moved the outstanding report to its own prefix, noted
in `COLLECTIONS.md`.

## Not in this sprint

**Posting the handover to the cash book.** The money is tracked from the customer's door
to the counter, but it stops there — it is not raised as a receipt or a cash-book entry. Freight lives on the customer's invoice, so making the
door collection a ledger entry means first making freight a receivable in its own right.
The figures are captured cleanly enough that a later sprint can post them without
re-entering anything.

**Multi-leg trips.** A lorry that goes out, comes back, reloads and goes again is two
passes today. A Trip header grouping several passes into one journey — one hire charge
apportioned across them, one odometer span — is the next layer up, and the pass already
carries everything it would need.

**Fuel and running cost.** `tripKm` is recorded but nothing consumes it yet. Cost per
kilometre against the hire charged is the report it exists for.

**Loading and unloading labour.** The invoice has charge fields for both; tying them to who
actually loaded is a warehouse-labour concern, not a dispatch one.
