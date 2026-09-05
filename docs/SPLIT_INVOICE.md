# Split invoice and cross-branch supply

One order, several branches, several invoices.

## The problem it solves

A customer orders 200 boxes. Your branch has 140. Another branch, twenty minutes away, has
the rest. Before this, the order simply refused: *short by 60 boxes in this branch*.

Now it can still refuse — that is still the default — but the refusal tells you where the
stock is, and you can let the other branch supply its share.

## Cross-branch is off by default

Drawing from another branch is a decision, not a convenience. Two branches registered
under different GSTINs are two persons under GST, so the same order becomes **two
invoices**, under two registrations, possibly taxed differently. That should never happen
by surprise.

So the switch lives on the **Confirm** dialog, which is the honest moment: confirming is
what actually reserves the stock. Hit a shortage, tick the box, confirm again.

When it is off, the shortage message names the branches holding the goods:

> Kajaria Vitrified 600 Black is short by 60 boxes in this branch. Thoppur has 85 boxes.
> Transfer it in, or allow cross-branch supply on this order.

Two ways out, both visible.

## Allocation: home branch always first

Stock is drawn in this order:

1. Every godown of the **home branch** — the one that took the order — oldest batch first
2. Then other branches, in branch-code order, oldest batch first

The home branch is emptied before another is touched, **however little it holds**. This is
not an optimisation. Selling from the branch that took the order keeps the goods near the
customer and raises one invoice instead of two; another branch is a fallback, however much
stock it happens to be sitting on.

Reservations carry the branch they were taken from, and that is what splits the invoice
later.

## The split

Open a confirmed order → **Invoice split**. One row per supplying branch:

| Column | What it says |
| --- | --- |
| Branch | Home branch marked with a building icon |
| Lines / Boxes | What that branch supplies |
| Value | Its share, before tax |
| Tax | **CGST + SGST** or **IGST** — see below |
| Invoice | The invoice raised for it, once there is one |

**Raise invoices** cuts one draft per branch. Branches already invoiced are skipped rather
than refused, so running it again after stock arrives picks up only what is new.

Each draft still has to be posted individually — posting is what takes the stock out of
that branch's godown.

### Branch-wise GST

This is the part worth understanding.

The tax on an invoice is decided by the **supplying branch's** state against the
customer's. So on one order:

- Your Tamil Nadu branch supplying a Tamil Nadu customer charges **CGST + SGST**
- Your Karnataka branch supplying the same customer charges **IGST**

Both are correct. Two branches under two registrations made two supplies, and each is
taxed where it was made. The split panel shows the column per row precisely so this is
not a surprise on printed paper.

Each invoice appears in its own branch's GSTR-1. See [GST_SUMMARY.md](GST_SUMMARY.md).

## What is not split

**The order** stays one order. Every invoice points back at it, the pending quantities
roll up across all of them, and the order moves to `PARTIALLY_INVOICED` and then
`INVOICED` as they post.

**Charges** — freight, loading, unloading — are not apportioned across branches. They sit
on the order and are entered on whichever invoice actually carries them. Splitting a lorry
charge across two invoices in two states raises questions nobody wants to answer.

**Invoice numbering** is branch-wise, so each branch's invoice carries its own prefix and
its own running count. See [NUMBER_SERIES.md](NUMBER_SERIES.md).

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /sales-orders/available-stock?crossBranch=true` | Free stock across every branch |
| `GET /sales-invoices/split-plan/:salesOrderId` | The split, before it is cut |
| `POST /sales-invoices/split` | Raise one draft per supplying branch |
| `PATCH /sales-orders/:id/confirm` | Takes `allowCrossBranch` |

## Troubleshooting

**Confirm still refuses after ticking cross-branch.** Then the stock genuinely is not
there — the message will say *across every branch*. Reduce the order or buy more.

**It pulled from another branch when mine had enough.** It cannot: the home branch is
always offered the stock first. Check whether your branch's stock was already reserved
against another confirmed order — free stock is on hand *less* active reservations.

**The split shows one row.** One branch is supplying everything, which is the normal case.
It still raises one invoice; nothing about the flow changes.

**Two invoices with different tax on one order.** Correct, if the branches are in
different states. Check the state codes on both branches if you did not expect it.

**A branch is skipped when I raise invoices.** Either it is already invoiced, or its
reservations have all been drawn down by an earlier invoice. The reason is shown per
branch.

**Goods still have to get to the customer.** A cross-branch order does not move stock
between branches — each branch dispatches its own share. If you would rather ship it all
from one place, transfer the stock in first: see [STOCK_TRANSFERS.md](STOCK_TRANSFERS.md).

## Drafts hold a claim, not stock

A draft invoice reserves nothing. What it does hold is a **claim on the order**: its
quantities count against what the order still owes, alongside posted invoices.

Without that, two drafts can each claim the same 50 boxes. Both look fine. Whichever
posts first takes the goods and consumes the reservation; the second dies at the counter
saying *"MAIN has only 0 pcs"* — true, and completely misleading, because the stock was
never missing. It had already been sold on the sibling invoice.

So:

- Creating or editing a draft that would exceed what is left is refused, and the message
  says how much is *already on an unposted draft*.
- A draft that has somehow been stranded — the order fully invoiced elsewhere — is told
  so by name at post time: *"all 50 pcs on this order has already been invoiced on
  INV-2026-00014. This draft is a duplicate."*
- Editing a draft does not count itself as a rival claim.

Delete the stranded draft, or reduce it to what is genuinely still pending.

## Godowns are always named with their branch

Most companies have a godown called MAIN in every branch. So a message saying *"MAIN has
only 0 pcs"* is unanswerable: the reader opens the stock screen, sees MAIN holding 138,
and concludes the software is wrong. It was not — it never said *which* MAIN.

Every stock shortage now reads `Branch · Godown`:

> KAJ-VIT-600-BLK: AM BUILD MART · MAIN has only 0 pcs, cannot invoice 50 pcs. It is in
> another branch: Head Office · MAIN has 138 pcs — transfer it in, or raise the order
> there instead.

Other branches are searched as well as other godowns, and reported separately, because
the remedies differ: moving stock between godowns of one branch is a shrug, and pulling it
from another branch is a transfer with paperwork.

## An invoice can only issue its own branch's stock

This is the rule underneath the whole split, and it was the one thing nothing checked.

A sales invoice belongs to one branch. Stock balances are keyed by branch. So a line
shipping from a godown that belongs to a *different* branch describes something that
cannot happen — and it failed in the worst possible way: creation succeeded, and posting
went looking for a balance keyed on the invoice's branch, found none, and reported the
godown as empty while the stock sat in it under its real branch.

Three guards now:

1. **Creating** an invoice whose line names another branch's godown is refused, naming
   both branches and pointing at **Raise invoices**.
2. **Posting** an older draft in that state says the same thing, before any talk of
   batches — no amount of batch-picking moves stock across a branch boundary.
3. **The invoice dialog only offers this branch's godowns.** When the rest of the order is
   held elsewhere it says so, names the branches, and disables the button.

Cross-branch orders are invoiced with **Raise invoices per branch**, which is the only
path that cuts one invoice per branch. The single-invoice dialog cannot do it and no
longer pretends to.

The button sits in the invoice dialog itself, next to the warning that explains why the
ordinary one is unavailable — being told the goods are in another branch and then having
to go and find the button is a worse answer than the button. It is also on the order's
**Invoice split** panel, which is where you go to see the breakdown first.

When only part of the order is elsewhere you get both choices: bill this branch's share
here, or raise every branch at once.
