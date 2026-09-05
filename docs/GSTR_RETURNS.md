# GSTR-1 export

The GST summary answers "what did we supply?". This answers "what do I upload?" — the
same period, cut into the sections the **GST offline tool** reads, as one workbook or a
sheet at a time.

## Reading it on screen

The **GSTR-1 return** panel at the bottom of the GST page shows the workbook as the tool
will read it: a tab per sheet, the summary band above the headers, and the rows in the
tool's own column order. What is about to be uploaded can be checked before it is, rather
than after the tool rejects it.

The summary figures are not restated on screen — the same definitions that generate the
workbook's `SUM` and `COUNTIF` formulas are evaluated here (`summarise` in
`packages/shared/src/utils/gstr1.ts`), so the screen cannot disagree with the file.

Long sections stop drawing after 300 rows. A month of B2B supplies can run to thousands
and the browser would spend its time on layout; the CSV and the workbook carry all of
them, which is what actually gets filed.

## The two downloads

**GSTR-1 (xlsx)** — the whole return as one workbook, laid out the way the offline tool's
own template is. Open the tool, point it at the file, and it imports.

**CSV, per sheet** — the CSV button on each tab, with the tool's column headers on the
first line. Useful when only one section needs redoing, or when the figures have to go to
an accountant who works in whichever spreadsheet they prefer.

## How an invoice is classified

The classification is the return's, not ours:

| The customer                      | The invoice                    | Section   |
| --------------------------------- | ------------------------------ | --------- |
| Has a GSTIN                       | Any                            | **B2B**   |
| No GSTIN, inter-state             | Invoice value over ₹2,50,000   | **B2CL**  |
| No GSTIN, anything else           |                                | **B2CS**  |

B2B and B2CL are reported **invoice by invoice**, one row per tax rate within the invoice
— an invoice with 18% and 5% lines produces two rows. B2CS is reported only as a **total
per state and rate**; the individual counter sales never appear, which is the point of it.

HSN (table 12) is reported twice, once for B2B supplies and once for B2C, and table 13
lists the document series issued in the period. Table 13 is the one place a **cancelled**
invoice belongs: the series has to account for the number, and the cancelled count is how
it does. Everywhere else, cancelled and draft invoices are excluded.

Place of supply falls back to the branch's own state code when the invoice does not carry
one, which is the correct reading of a counter sale.

## The workbook's layout is the contract

The offline tool reads its sheets **positionally**, not by matching header names:

```
row 1   title, then the word HELP
row 2   summary labels
row 3   summary formulas
row 4   column headers
row 5+  data
```

A row out of place makes the upload fail with an error that does not say which sheet. So
the layout is written in exactly one place — `writeSheet` in
`apps/api/src/modules/sales/infrastructure/gstr1-workbook.ts` — and everything the sheets
themselves differ by in another: `GSTR1_SECTIONS` in `packages/shared/src/utils/gstr1.ts`.

That constant is shared deliberately. The API writes those columns into the workbook, and
the web app draws the same columns on screen and into the per-section CSV; had each kept
its own copy of the headers, the three would have drifted and the drift would only have
surfaced at the point of filing.

The summary band is described rather than written twice. Each figure says what it
measures — `total` or `count` — and over which column, from which the workbook builds
`SUM(E5:E1048576)` or the template's `SUMPRODUCT(…/COUNTIF(…))`, and the screen computes
the same number directly. The `lastRow` on each figure is copied from the template, not
chosen: a sum runs to the end of the sheet cheaply, but the distinct count is a `COUNTIF`
over the whole range and is capped, because over a million rows it would hang Excel.

Blank columns — `E-Commerce GSTIN`, `Applicable % of Tax Rate` — are written as empty
cells rather than zeros. The tool treats a zero as a value it has to validate.

## CSV, carefully

`toCsv` in `packages/shared` quotes to RFC 4180, and prefixes a leading `=`, `+`, `-` or
`@` with an apostrophe so a spreadsheet reads the cell as text. That is not paranoia about
formula injection alone: an invoice reference like `-2024/07` would otherwise be evaluated
into a number. Numbers themselves are untouched, so a negative amount stays negative.

The browser writes the file with a UTF-8 BOM, without which Excel on Windows renders ₹ and
Tamil names as mojibake.

## API

| Method | Path                     | Returns                    | Permission       |
| ------ | ------------------------ | -------------------------- | ---------------- |
| GET    | `/dashboard/gstr1`       | The sections as JSON       | `gstReport:read` |
| GET    | `/dashboard/gstr1.xlsx`  | The workbook, as a download | `gstReport:read` |

Both take `from`, `to` and an optional `branchId`, and both respect branch scope. The
sections are only fetched when the panel on the GST page is opened — they are the whole
period's invoices, and the page should not pay for them on every visit.

The xlsx route streams through `@Res()`, so it sits outside the standard response
envelope. The web app therefore cannot use `apiFetch` for it: `downloadFile` in
`apps/admin-pwa/src/lib/download.ts` attaches the bearer token by hand and reads the
envelope only on the failure path, since an error is still JSON even when success is not.

## Before filing

The GST summary above the sections is the check to run first. An **HSN not set** row means
products are missing an HSN code, and an unexpected inter-state row usually means a
customer's state code is wrong. Both are cheaper to fix here than after upload.
