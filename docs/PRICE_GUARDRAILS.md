# Price guardrails

Two rules stand between a salesperson and a bad price, and they are deliberately separate.

## The gap this closed

Quotations and sales orders each enforced the branch minimum. **Sales invoices enforced
nothing.**

An invoice can be raised without an order — a counter sale — so that path was the obvious
way past the floor, and the counter is where discounts actually get given. All three
documents now go through one guard.

## The two rules

| Rule | Breached when | Permission to override |
| --- | --- | --- |
| Below cost | net rate < landing cost | `sales:sellBelowCost` |
| Below the branch minimum | net rate < that branch's `minSellingPrice` | `quotation:overridePrice` |

**They are checked separately on purpose.** A branch minimum is typed by a person and can
itself be set below landing cost by mistake. When that happens the minimum passes and the
sale still loses money — which is exactly the case a floor exists to catch. Folding the two
together would mean permission to ignore a minimum quietly included permission to lose
money, and nobody would have decided that.

Below cost is reported first when both are breached. Losing money is the more serious fact
and the message should lead with it.

## The floor applies to the net rate

What the customer actually pays, after discount. A discount comes out of margin and nowhere
else, so measuring against the list price would report a margin the business never earned.

`1,250 less 30%` is `875`, and `875` is the figure the floor sees.

## A thin margin warns, it does not block

`sales.marginFloorPct` (default **10**, set it to 0 to turn off) flags a line whose margin
falls under it. That is a warning on the screen, never a refusal.

Thin is sometimes the right call — clearing an old shade lot, a first order from a customer
worth having — and a rule that cannot be judged gets worked around rather than followed.
Only cost and the branch minimum are walls.

## Converting a quotation

Rates carry over from the quotation **unchecked**, because they were already checked there.
A price below the floor could only have reached the quotation if someone with the permission
put it there; re-running the guard at conversion would block whoever happens to be doing the
paperwork, and the decision was never theirs to make.

## What is not guarded

- **Cost is unknown.** A product with no landing cost cannot be checked against one. The
  branch minimum still applies.
- **Neither is set.** Nothing to check, and the line passes.

Both are silent rather than blocking. Refusing a sale because a master record is incomplete
punishes the counter for something the office did.

## Where margin comes from

The same landing cost the profit report uses. See [PROFIT.md](PROFIT.md) — and note that a
wrong `sq.ft per box` makes every per-sq.ft figure here unreliable too, which is what the
product audit is for.
