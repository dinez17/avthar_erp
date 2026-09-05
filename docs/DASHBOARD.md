# Overview dashboard

The landing page answers the questions asked at the counter each morning: what did we
sell, what did we collect, who owes us, and what is running out.

## Figures

Six cards, each clicking through to the screen behind it:

| Card            | Meaning                                                        | Goes to          |
| --------------- | -------------------------------------------------------------- | ---------------- |
| Sales today     | Posted invoices dated today, with the count                     | Sales invoices   |
| Collected today | Posted receipts dated today                                     | Collections      |
| Outstanding     | Every unpaid posted invoice, with the overdue slice called out   | Customer ledger  |
| Orders pending  | Confirmed and part-invoiced orders still to bill                 | Sales orders     |
| Stock value     | On-hand boxes valued at landing cost                             | Stock            |
| Low stock       | Products below their reorder level                               | Stock reports    |

The period block underneath — sales, GST, collections, purchases, invoice count — follows
the window chosen in the toolbar (7, 30 or 90 days) and the branch filter.

**Outstanding is deliberately not windowed.** A debt from four months ago is still a debt;
filtering it by the chosen period would understate what is owed. Everything else respects
the window.

## Sales trend

A bar per day, scaled against the busiest day in the window, with the exact figure on
hover. Days with no sales are still drawn, so a quiet week is visible rather than
invisible.

Drawn with plain CSS. A charting library is a large dependency for one view, and the
trend needs no axes, legends or interaction beyond a tooltip.

## Cost of the query

One endpoint, `GET /dashboard/summary`, runs its ten queries in parallel and does the
grouping in memory. The window is capped at a year so a bookmarked URL cannot ask the
database to scan everything.

Requires `dashboard:read`, and respects branch scope like every other list.

## What is not here yet

Profit needs the landing cost captured **at the time of sale** — today's landing cost has
moved since. That means storing cost on the invoice line, which belongs with the profit
report rather than being estimated here. GST is shown as a total; the return-ready
breakdown by rate and place of supply is its own report.
