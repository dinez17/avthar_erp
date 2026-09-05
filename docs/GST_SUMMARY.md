# GST summary

The page a return is filed from: the period's totals across the top, and underneath the
return itself, sheet by sheet, as the GST offline tool reads it. The sheets are described
in `GSTR_RETURNS.md`.

## What counts

**Posted invoices only.** A draft is not a supply, and a cancelled invoice never happened
— neither belongs in a return. The one exception is the documents sheet, where a cancelled
number still appears so the series accounts for it. Purchases are not here; this is
outward supply only.

The figures come from the tax **stored on each invoice when it was raised**, never
recalculated. A GST rate change, a customer moving state, or a product's HSN being
corrected cannot rewrite a period that has already been filed.

## The totals band

Invoice count, taxable value, CGST, SGST, IGST, total tax and invoice value for the
period. It is the figure to reconcile against the books before filing; the sheets below
break the same money into the sections the return asks for.

`GET /dashboard/gst-summary`, permission `gstReport:read`, branch scope respected.

## The groupings the endpoint still returns

`gst-summary` also returns the period grouped **by tax rate**, **by place of supply** and
**by HSN**. They are no longer drawn on the page — the return's own sheets say the same
thing in the form that gets filed — but the endpoint keeps them, because they answer
questions the sheets do not:

- By tax rate, an invoice with lines at two rates counts once in each, so those invoice
  counts can add up to more than the header count.
- By place of supply, an unexpected inter-state row usually means a customer's state code
  is wrong.
- By HSN, products with no HSN code are grouped under **Not set** rather than dropped,
  because that is a data gap to fix before filing.

## Period

Defaults to the current calendar month, which is how a GST period is chosen. Any range up
to a year can be entered. The browser's own print gives a filed copy.

## The other half

Purchase-side GST — what was paid on inward supplies, and how much of it sets off against
the output tax above — is on its own page. See [PURCHASE_GST.md](PURCHASE_GST.md).
