# Printing documents

Printing is done by the browser, not by a server-side PDF renderer. A print route renders
the document as HTML and `@page` rules give the browser the paper size; the operator gets
the normal print dialog, and "Save as PDF" is one of the destinations there. This keeps
counter printing working offline in the PWA and needs no headless browser on the server.

## Quotation

Route: `/quotations/:id/print` — reached from the printer icon on the Quotations list.

The route sits **outside** the dashboard layout, so the sidebar, header and breadcrumb are
never part of the document. On top of that the print stylesheet hides everything on the
page and re-shows only the sheet, which also covers anything the shell mounts globally
(toasts, a service-worker update banner).

Three paper sizes, switched from the toolbar (the toolbar itself never prints):

| Size        | Use                        | Page rule                       |
| ----------- | -------------------------- | ------------------------------- |
| A4          | Office copy, filing, email | `size: A4 portrait; margin 12/10mm` |
| 80 mm roll  | Counter thermal printer    | `size: 80mm auto; margin 3mm`   |
| 58 mm roll  | Handheld/mobile thermal    | `size: 58mm auto; margin 3mm`   |

`auto` height matters on a roll: the paper is continuous, so the sheet must grow with the
content instead of being paginated.

### Layout differences

A roll is far too narrow for a column grid, so the same content sets differently:

- **A4** — two-column header (customer block against document details), a five-column item
  table (#, item, qty, rate, amount), a totals block beside the amount in words, terms,
  and a signature line.
- **Roll** — single column in a monospace face. Item name on its own line, then quantity,
  rate and amount underneath it; totals as label/value pairs; no signature block.

Per the counter's preference the item table shows **item, quantity, rate and amount only**
— no MRP and no discount column. The size is printed alongside the item name because it
identifies the tile.

Quantities print as entered: `10 box 2 pcs`, or `12 pcs` for piece-only goods.

### Data

One call, `GET /quotations/:id/print`, returns the quotation with its lines plus the
letterhead (company name and GSTIN, branch address, phone, email) and the terms. Nothing
is assembled from several requests, so the page cannot print a half-loaded document.

### Terms

The footer text comes from the `quotation.terms` setting — one term per line, editable
from **Settings** without a code change. The settings field is multi-line, so terms can be
typed with real line breaks; a literal `\n` is accepted as a separator too. Blank lines
are dropped. The seed installs a
sensible default set (validity, no returns, delivery, breakage, payment).

### Amount in words

`amountInWords` in `@tiles-erp/shared` spells the total using the Indian system
(crore/lakh/thousand):

```
14750.50 → "Rupees Fourteen Thousand Seven Hundred Fifty and Fifty Paise Only"
```

It rounds to the nearest paisa with an epsilon nudge, because binary floating point puts
`0.145 * 100` at `14.4999…` and would otherwise print a paisa short.

## Printer setup notes

- In the Chrome print dialog choose the thermal printer **and** set Margins to *None* and
  Scale to 100%; some drivers otherwise shrink the roll output.
- If the roll cuts short, check that the driver's paper size matches the width you picked
  in the toolbar (80 mm vs 58 mm).
- The A4 layout is designed for a single page for a typical counter quote; long item lists
  simply flow onto a second page with the table header repeated.

## Tax invoice

Route: `/sales-invoices/:id/print` — from the printer icon on the Sales invoices list,
which offers the same three paper sizes and jumps straight to the chosen one.

Same mechanics as the quotation: bare route outside the dashboard layout, the same
`@page` rules per size, and the toolbar excluded from the paper.

What a tax invoice adds over a quotation:

- **TAX INVOICE** as the document title, and "— CANCELLED" appended when it is.
- Seller GSTIN in the letterhead, buyer GSTIN in the billing block, and the **place of
  supply** — the field that justifies the tax split.
- An **HSN** column and a per-line **GST%** column on A4.
- **CGST + SGST** rows, or a single **IGST** row when the supply crosses a state border,
  driven by `isInterState` rather than recomputed on the client.
- Taxable value shown separately from the tax, as a GST invoice must.
- A **declaration** above the signature.

Both blocks of text come from Settings and can be edited without a code change:

| Key                   | Prints as                          |
| --------------------- | ---------------------------------- |
| `invoice.terms`       | Numbered terms in the footer       |
| `invoice.declaration` | One paragraph above the signature  |

The roll layouts drop the HSN, GST% and signature blocks — there is no room, and a
thermal slip is a counter receipt rather than the filed copy. The tax split, the total in
words and the terms still print.

## Money receipt

Route: `/receipts/:id/print` — from the printer icon on the Collections list.

The only document that **defaults to the 80 mm roll** rather than A4: a receipt is handed
across the counter as the customer pays, and the A4 copy is the exception rather than the
rule. The dropdown lists the roll sizes first for the same reason.

It prints what the customer needs to see and nothing else:

- Who paid, how much, and on what date
- The tender breakdown — cash, UPI, cheque with its number — one row each
- The total in words
- Which invoices it settled, and any amount left on account
- **Balance outstanding** after the receipt, which is the question they ask next

A cancelled receipt prints with "— CANCELLED" in the title, so a reprint can never be
mistaken for a live one.
