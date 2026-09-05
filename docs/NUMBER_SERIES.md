# Document numbering

Every document is numbered by a **series**: a prefix you choose, the financial year, and a
running count. Each branch counts its own.

Sidebar → **Number series**. Permission `settings:manage`.

## The shape of a number

```
AMB / 26-27 / 0001
 │      │       └── running count, padded to the width you pick
 │      └────────── financial year, 1 April to 31 March
 └───────────────── your prefix
```

Prefix, separator (`/` or `-`), width and whether the year appears are all yours. The
parts are composed rather than templated: a free-form pattern is one typo away from two
branches sharing a series, and a duplicate invoice number is not something you can quietly
fix afterwards.

## Branch-wise

Every document type is listed for the branch you pick, whether or not you have set it.
Unset ones show the built-in default in grey and keep working exactly as before — so
nothing changes until you decide it should.

Resolution order: **the branch's own series → the company-wide series → the built-in
default.** So you can set one company-wide prefix and override only the branches that need
their own.

Transporter and driver codes are company-wide by nature and cannot be set per branch.

Cash entries, expense vouchers and day closes are company-wide too, for a harder reason: a
cash account need not belong to any branch — an owner's holding belongs to the company —
so a day close hands money from a branch drawer to a branchless account and writes both
legs at once. Two counters feeding one unique column is a collision waiting to happen, and
there was never a meaningful branch to count these by.

## Setting a branch up in one pass

The whole table is the form. Type prefixes straight into it, adjust separators and widths
in place, and press **Save** once — nothing is written until you do.

**Apply to all** fills the branch prefix across every document, keeping the code that
tells each one apart:

```
AMB-QT    AMB-SO    AMB-INV   AMB-RCPT
AMB-PO    AMB-GRN   AMB-PINV  AMB-PRET
```

That is the whole point of the code. Give every document the bare branch prefix and a
quotation and an invoice both print `AMB/26-27/0001` — the same string on two different
pieces of paper, which is exactly what a document number exists to prevent. The switch is
there if you want it anyway.

A trailing separator is stripped, so typing `AMB-` gives `AMB-QT`, not `AMB--QT`.

Transporter and driver codes are company-wide and are deliberately left alone.

Edited rows highlight, their preview turns blue, and the button counts what is pending.
**Discard changes** puts the sheet back.

The batch is validated as a whole before any of it is written. Half-applied numbering is
worse than none — some documents would move to the new prefix and some would not, and
telling which afterwards means reading the counter table.

## The financial year

The count restarts on **1 April**, and the year is part of the number, so each year's
series stands on its own. An invoice on 31 March is `AMB/25-26/0412`; the next morning it
is `AMB/26-27/0001`.

Turn **Restart the count each 1 April** off for a series that should climb forever — the
year then disappears from the number too.

## Why the counter is its own table

Numbers used to be "count the rows, add one". That is wrong in two ways that both bite
eventually:

- Two people saving at the same moment both count the same total, and both get the same
  number.
- Deleting a draft lowers the count, so the next document reuses a number already printed.

Now a dedicated counter is incremented under a row lock inside the same transaction that
writes the document. Two tills asking at the same instant are serialised, and if the write
then fails the counter rolls back with it.

The counter is machine state and is never edited from the screen. Moving it backwards
would mint a duplicate.

## Changing a prefix mid-year

Allowed, and warned about. If documents have already been issued this year under the old
prefix, the dialog says how many — that year's series then exists in two halves, which an
auditor will ask about. Documents already issued keep the numbers they were given; only
new ones use the new prefix.

Two branches cannot share a prefix for the same document type. They would interleave into
one series on paper while counting separately underneath, printing the same number twice.

## Two branches on the same prefix will collide

A document number is unique across its whole table, but the counter is per branch. Two
branches left on the **built-in default** therefore share a prefix and each count from 1 —
both reach `INV/26-27/0001`, and the second document fails to save.

Configured series are protected: the settings screen refuses to let two branches share a
prefix for one document type. Unconfigured ones are not, because they all inherit the same
built-in code.

**So: give every branch its own prefix before it raises its first document.** "Apply to all"
with the branch code does exactly this.

Cash documents sidestep it by being company-wide (below).

## What is covered

Sales — quotation, sales order, sales invoice, receipt.
Purchase — order, goods receipt, invoice, return, supplier payment.
Stock — transfer, transfer delivery challan, transfer tax invoice.
Dispatch — gate pass, driver cash handover.
Cash — entry, expense voucher, day close. **Company-wide, not per branch.**
Masters — transporter and driver codes, company-wide.

The transfer challan and transfer tax invoice are separate series on purpose: a tax
invoice must sit in a continuous series of its own, and interleaving challans into it
would guarantee gaps. See [STOCK_TRANSFERS.md](STOCK_TRANSFERS.md).

## A note on gaps

The number is taken immediately before the document is written, in the same transaction.
A document that fails to save takes its number back with it. A document that is **saved
and then cancelled** keeps its number — which is correct: the number was issued, and GST
wants cancelled invoices accounted for, not erased.

## Troubleshooting

**A branch is still numbering with the old prefix.** Its series is unset and inheriting.
Pick the branch in the selector at the top — the default list is the company-wide one.

**"That prefix is already used."** Another branch has it for the same document type. Give
each branch something distinct; the branch code is the usual choice.

**The next number is not 0001 on a new branch.** The counter is per branch and per year,
so a new branch does start at 1. If it does not, documents have already been raised under
the inherited series this year.

**A number was skipped.** Something failed between allocation and commit, or a document
was created and then hard-deleted as a draft. Cancelled documents keep their numbers and
are not gaps.
