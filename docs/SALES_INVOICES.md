# Sales invoices

The invoice is the point of no return: it takes the goods out of the godown and puts the
value on the customer's account. Everything before it — quotation, order, reservation —
is a promise.

## Lifecycle

```
Sales order (CONFIRMED)
        │  raise invoice (all or part)
        ▼
     DRAFT ──post──► POSTED ──cancel──► CANCELLED
       │                                    ▲
       └──delete                            │
                     (stock returns, order re-opened)
```

- **DRAFT** — editable, holds nothing. Deleting it changes no stock.
- **POSTED** — SALE movements written, balances reduced, reservations consumed, order
  status rolled forward.
- **CANCELLED** — a posted invoice writes SALE_RETURN movements back into the same
  godown and batch, and the order's invoiced quantity is undone. An invoice with money
  collected against it cannot be cancelled until the collection is reversed.

## What posting does, in one transaction

For each line, in order:

1. Read the balance for the exact stock key (product, branch, godown, gate, batch,
   shade) and refuse if it is short — the read and the write share a transaction, so two
   tills cannot oversell the same box.
2. Write a `SALE` / `OUT` movement referencing the invoice.
3. Decrement the balance.
4. Increment the order line's `invoicedQtyBoxes` and mark the matching reservations
   `CONSUMED`.

Then the invoice flips to POSTED and the order status is recomputed from its lines:

```
invoiced = 0        → CONFIRMED
0 < invoiced < ordered → PARTIALLY_INVOICED
invoiced ≥ ordered  → INVOICED
```

Recomputing rather than tracking by hand means cancelling lands on the right status too.

## Partial and multiple invoices

An order can be invoiced in as many parts as the customer takes delivery in. The
draw-down is checked per order line and across all lines of the invoice being created, so
two lines of the same invoice cannot together exceed what the order still owes:

> Kajaria IVR: only 10 box left to invoice on this order

Splitting one order across branches needs cross-branch reservations, which the order
module does not do yet; today an order and its invoices all belong to one branch.

## GST

Place of supply decides the split, using the two-digit state codes on the branch and the
customer:

| Condition                          | Tax                          |
| ---------------------------------- | ---------------------------- |
| Customer state = branch state      | CGST + SGST, half each        |
| Customer state ≠ branch state      | IGST, the whole amount        |
| Either state code missing          | Treated as intra-state        |

Halving can leave a paisa behind; `splitGst` gives it to CGST and derives SGST from the
remainder, so the two always add back to the exact tax. The invoice stores all three
columns plus the total, and each line carries its own split for the GST return.

## Credit control

Checked twice — once when the order is confirmed, again when the invoice is posted,
because the outstanding may have moved in between:

```
outstanding (posted, unpaid invoices) + this invoice ≤ customer.creditLimit
```

A limit of zero means none is set. `customer:creditApprove` (or `SUPER_ADMIN`) may post
past it.

The due date defaults to the invoice date plus the customer's credit days.

## API

| Method | Path                                     | Permission              |
| ------ | ---------------------------------------- | ----------------------- |
| GET    | `/sales-invoices`                        | `salesInvoice:read`     |
| GET    | `/sales-invoices/:id`                    | `salesInvoice:read`     |
| GET    | `/sales-invoices/invoiceable/:orderId`   | `salesInvoice:create`   |
| POST   | `/sales-invoices`                        | `salesInvoice:create`   |
| PATCH  | `/sales-invoices/:id`                    | `salesInvoice:update`   |
| PATCH  | `/sales-invoices/:id/post`               | `salesInvoice:post`     |
| PATCH  | `/sales-invoices/:id/cancel`             | `salesInvoice:cancel`   |
| DELETE | `/sales-invoices/:id`                    | `salesInvoice:delete`   |

Every write carries the `version` the client last read.

## Raising one

From **Sales orders**, the receipt icon on a confirmed or partly invoiced order opens the
invoice dialog. It lists each line's ordered, invoiced and pending quantity, pre-filled
with everything still outstanding, and a godown picker showing which reservations hold
the stock. The result is a draft; posting is a separate, deliberate action.
