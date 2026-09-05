# Collections and the customer ledger

An invoice puts money on the customer's account; a receipt takes it off. The link between
the two is the **allocation** — which invoice each rupee settles — and that link is what
makes the ledger add up.

## Receipt lifecycle

```
DRAFT ──post──► POSTED ──cancel──► CANCELLED
  │                                    ▲
  └──delete                            │
                    (invoices become outstanding again)
```

- **DRAFT** — recorded but not applied. Nothing on any invoice has changed, so it can be
  edited or deleted freely.
- **POSTED** — each allocation increments its invoice's `paidAmount`.
- **CANCELLED** — the same amounts are decremented again. Used when a cheque bounces or
  the receipt was entered against the wrong customer.

Posting re-reads each invoice's balance **inside the transaction** and refuses to settle
more than is outstanding, so two clerks taking payment at the same time cannot both
apply the same money.

## Several tenders on one receipt

A customer often pays partly in cash and partly by UPI. A receipt therefore holds one or
more **payment lines** — mode, amount, and a reference where the mode has one — and the
receipt total is their sum rather than a separately typed figure that could disagree.

The header keeps a `mode` for filtering and reporting: the tender itself when there is
one, and `MIXED` when there are several. The list shows the readable form,
"Cash 1,000 + UPI 5,000", so the split is visible without opening the receipt.

## Knowing what is owed

Before any money is entered, the receipt dialog shows the customer's total outstanding
and how much of it is overdue, across how many invoices. It comes from
`GET /receipts/customer-due`, the same open-invoice arithmetic the allocation uses, so
the figure at the top always agrees with the rows underneath.

As the amount is entered, each invoice row shows the **balance** it would be left with,
green once it clears, and the footer leads with the customer's balance after this
receipt: `outstanding − allocated`. The question a counter actually asks — "so how much
does he still owe?" — is answered without arithmetic.

## Allocation

The counter case is simple: the customer hands over money and it clears the oldest bills
first. `allocateOldestFirst` does exactly that, and the receipt dialog shows the split as
you type the amount so it can be adjusted before saving.

Anything left when every invoice is clear stays **on account** — the receipt's
`onAccountAmount`. It is real money held against the customer, and it reduces their
closing balance on the statement even though no invoice points at it.

Allocations are validated twice: they cannot exceed the invoice's outstanding amount, and
together they cannot exceed the amount received.

## The statement

`GET /customers/:id/ledger` returns the opening balance followed by every posted invoice
as a **debit** and every posted receipt as a **credit**, in date order, with a running
balance. A positive balance means the customer owes money.

A date range folds everything before `from` into the opening balance rather than dropping
it, so a statement for one month still reconciles with the customer's own books.

## Printing

The printer icon on the Collections list produces a money receipt — 80 mm by default,
58 mm or A4 if asked. See `PRINTING.md`.

## Two separate screens

The two questions are different, so they are different pages:

- **Outstanding** — every customer with a balance, aged. The collections list to work
  through, with a link from each row into that customer's statement.
- **Customer ledger** — one customer's statement, for answering "what does my account
  look like?" when they ask.

## Outstanding and ageing

`GET /customers/outstanding` gives one row per customer with a balance, split into
buckets by how long the money has been owed:

| Bucket   | Meaning                        |
| -------- | ------------------------------ |
| Not due  | Still within the credit period |
| 1–30 d   | Up to a month past due         |
| 31–60 d  |                                |
| 61–90 d  |                                |
| 90+ d    | The column to worry about      |

Age is measured from the **due date** where the invoice has one — that is the promise
that was broken — and from the invoice date otherwise, since a cash sale was payable the
day it was raised. `overdueDays` and `bucketFor` in `application/ageing.ts` are the single
source of that rule, shared with the dashboard so the two screens cannot disagree. The report also flags customers
whose outstanding exceeds their credit limit, which is the same number the invoice
posting check uses.

## API

| Method | Path                          | Permission             |
| ------ | ----------------------------- | ---------------------- |
| GET    | `/receipts`                   | `receipt:read`         |
| GET    | `/receipts/open-invoices`     | `receipt:create`       |
| GET    | `/receipts/:id`               | `receipt:read`         |
| POST   | `/receipts`                   | `receipt:create`       |
| PATCH  | `/receipts/:id`               | `receipt:update`       |
| PATCH  | `/receipts/:id/post`          | `receipt:post`         |
| PATCH  | `/receipts/:id/cancel`        | `receipt:cancel`       |
| DELETE | `/receipts/:id`               | `receipt:delete`       |
| GET    | `/receivables/outstanding`    | `customer:ledgerRead`  |
| GET    | `/receivables/:id/ledger`     | `customer:ledgerRead`  |

These sit under `receivables` rather than `customers` on purpose: the parties module owns
`@Controller('customers')` with a `:id` route and is registered first, so
`/customers/outstanding` was being read as a customer id and rejected. Prefix collisions
across modules are silent — the wrong controller simply answers — so give a new endpoint
its own prefix rather than sharing one.

## Delivery

**Delivery and proof of delivery** were listed alongside collections on the roadmap, but
they belong with the gate pass rather than the invoice: one lorry carries several invoices
and one invoice is sometimes loaded over two trips. They shipped with the dispatch module
— see `DISPATCH.md`.

## The other half

Money going **out** — payments to suppliers, the supplier ledger and payables ageing —
works the same way, with debit notes settling a bill alongside cash. See
[SUPPLIER_PAYMENTS.md](SUPPLIER_PAYMENTS.md).
