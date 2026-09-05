# Profit

What was sold, what it cost, and the difference.

Sidebar → **Profit**. Permission `profitReport:read`.

## Cost is frozen when the invoice is posted

Each invoice line carries the product's landing cost **as it was on the day the invoice was
posted**. The report never reads the product's cost today.

This is the whole design. Working margin out from the current landing cost means a delivery
arriving next month silently restates last month's profit — a report run in June for April
would disagree with the same report run in May, and neither would be wrong in a way anyone
could point at. Every other figure on an invoice is already frozen at posting for exactly
this reason: the customer's name, the GST rate, the place of supply.

**Lines posted before this existed have no cost of their own.** Two things follow.

A one-off backfill wrote each product's landing cost onto them and marked it
**estimated** — today's cost set against an older sale price, which is exactly the
restatement the frozen column exists to prevent. The report says which revenue rests on an
estimate so it can never be mistaken for a captured figure. Invoices posted from now on
freeze their cost and need no estimate.

Where a product had no landing cost, nothing could be estimated from, and the line still has
none. Those rows show **Not recorded** and a dash — never `0.00` and `100%`. A margin on a
line with no cost is not a large margin, it is an unknown one, and printing it as a number
turns a gap into a claim.

## What counts as revenue

The goods value before GST. Freight, loading and unloading are **excluded**: they are costs
recovered, not margin earned, and folding them in makes a delivery look like a sale.

Only **posted** invoices. A draft is a proposal and a cancelled one never happened; counting
either reports profit on goods still in the godown.

## Four groupings

| | Answers |
| --- | --- |
| By invoice | Which sales made money and which did not |
| By product | What is worth stocking |
| By branch | Where the margin is being earned |
| By salesman | Who is discounting |

Thinnest margin sorts first. A report read top-down should open on what needs attention
rather than on whatever sold most. Invoices raised without a salesman are grouped as
*No salesman recorded* rather than dropped — unattributed sales are a real category, and
hiding them makes the attributed ones look like the whole picture.

**CSV** exports what is on screen.

---

# Product data audit

Sidebar → **Product audit**.

## The problem it catches

`sq.ft per box` is typed by hand and nothing downstream questions it. A 600x600 tile packed
3 to a box covers **11.63 sq.ft**; the tile's area in cm² is **3,600**, and 3,600 is what
gets typed.

Nothing then complains. Stock valuation, every per-sq.ft rate, and every margin built on
them become silently absurd, and it stays invisible until somebody reads a report and does
not believe it.

## How it checks

From the product's own size and piece count:

```
sq.ft per box  =  length_mm × width_mm × pieces ÷ 92,903.04
```

A **10% tolerance** is allowed, because a "600x600" tile is really 597x597 and the trade
rounds. Only differences too large to be rounding are listed.

Products whose `sizeMm` cannot be read are skipped and counted, not guessed at — a size
nobody can parse is a size nobody should be flagged over.

## It names the mistake

Flagging is not much use on its own. Where the ratio is recognisable, the page says what
probably happened:

- *Looks like the tile area in cm² rather than square feet* — the common one
- *Looks like the area of one piece rather than the whole box*
- *Looks like the area was multiplied by the piece count twice*
- *Looks like square metres*

"3,600 is the tile's area in cm²" tells someone what to type instead. "This looks wrong"
leaves them comparing spreadsheets.

## Correcting

Select rows or **Correct all**. The recorded area is replaced with the figure the size
implies, on the flagged products only — recomputing every product would quietly round the
honest ones, and a 597x597 tile is allowed to say 11.4 rather than 11.625.

Worst first, ordered by the size of the error multiplied by what is held: a wrong figure on
a product nobody stocks is a typo, and the same figure on 138 boxes is a valuation nobody
should be reading.

**Stock valuation, per-sq.ft rates and past margins all move when you do this.** That is the
point — they are wrong now — but expect the numbers to change.

The Profit page carries a warning while anything is outstanding, because a margin built on a
bad area is worse than no margin at all.
