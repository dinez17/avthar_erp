# Purchase GST and input credit

**Purchase GST** is the inward half of the GST picture. The [GST summary](GST_SUMMARY.md)
says what tax you charged; this says what tax you paid, and what is left over once one is
set against the other.

Sidebar → **Purchase GST**. Permission `gstReport:read` — the same one the outward summary
uses, so anyone who could already see GST can see this.

## The tax position

The band across the top is the answer people come to the page for:

| Line | What it is |
| --- | --- |
| Output tax | Tax charged on posted sales invoices in the period |
| Input credit | Tax paid on posted purchase invoices from suppliers with a GSTIN |
| Net | Output minus input, **head by head** |

Then, to the right:

- **Payable in cash** — the heads where output exceeded input, added up. This is money
  that has to be found.
- **Credit carried forward** — the heads where input exceeded output. GST does not refund
  a surplus in the ordinary course; it sits against the next period.
- **Not claimable** — tax paid to suppliers with no GSTIN on file. It was still paid, so
  it is shown, but it is a cost sitting in your landed price rather than a credit.

### Why a period can owe tax and carry credit at the same time

The netting is done **per head**. CGST credit cannot pay an SGST liability, and neither can
pay an IGST one. So a month of local sales and imported stock can be short on CGST and
SGST while sitting on unused IGST — payable and carried-forward are both non-zero, and
that is correct, not a bug.

The real return then applies a set-off *order* for IGST credit against the other heads,
which varies with the law of the day. This page deliberately does not model that: it shows
the position, and the return decides the order. Anything else would drift out of date
silently.

## Where the CGST/SGST/IGST split comes from

A **sales** invoice carries its own CGST, SGST and IGST columns, written when the invoice
was raised. Those are read as stored, never recalculated — the same rule the outward
summary follows.

A **purchase** invoice stores tax as one figure per line. The split is therefore derived
here, from where the supplier is against where the branch is, using the same
`isInterStateSupply` and `splitGst` the sales side uses. A purchase and a sale across the
same state line split identically.

The practical consequence: **a supplier's state code decides your credit.** A Gujarat
supplier saved with a Tamil Nadu state code turns IGST credit into CGST + SGST credit, and
the return will not match. If the position looks wrong, check the **By supplier** tab
first — it labels every supplier inter- or intra-state.

## The tabs

Each one downloads as CSV.

**By tax rate** — inward supplies grouped by 5%, 18% and so on. An invoice with lines at
two rates counts once in each, so these invoice counts can add up to more than the header
count. The same convention as the outward summary.

**By HSN** — taxable value and tax per HSN code, with the boxes behind it. Products with
no HSN are grouped under **Not set** rather than dropped, and flagged in amber: that is a
data gap to fix before filing, not a rounding difference.

**By supplier** — the GSTIN, the supply type, and the tax. Suppliers with no GSTIN carry a
**No GSTIN** chip; their tax is the *not claimable* figure in the position band.

## What counts

Posted invoices only, on both sides. A draft is not a purchase and a cancelled one never
happened, so neither carries credit.

The period defaults to the current calendar month, which is how a GST period is chosen.
Any range up to a year can be entered. Branch scope is respected: choose a branch to see
that branch's position, or leave it on all branches for the company's.

## Endpoints

| Endpoint | Returns |
| --- | --- |
| `GET /purchase-gst/summary` | Inward supplies, plus the by-rate, by-HSN and by-supplier groupings |
| `GET /purchase-gst/position` | Output, input, net, payable, credit carried forward, not claimable |

Both take `from`, `to` and an optional `branchId`, all optional; both are
`gstReport:read` and branch-scoped.

## Troubleshooting

**Everything is zero.** The dates. `from` and `to` are sent as full day boundaries in your
local time — if you have hand-built a URL with a bare date, `2026-08-11` means midnight
UTC and the working day falls outside the period.

**The tax does not match the supplier's invoice.** Check the supplier's state code, then
the branch's. The split is derived from the two; if either is wrong the total is right but
the three heads are not.

**A supplier's credit is missing.** They have no GSTIN saved. The tax moves to *not
claimable* rather than vanishing — add the GSTIN in the supplier master and the period
recalculates on the next load.

**Credit carried forward looks too large.** Usually a period with heavy buying and light
selling, which is normal in a stocking month. If it is not, look at the by-supplier tab
for an inter-state row that should have been local.
