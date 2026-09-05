# Showing quantities

Tiles are stored as a decimal box figure (`qtyBoxes`) because that is the only way to
hold "ten boxes and two loose pieces" in one number. **That number is never shown to a
user.** A counter clerk does not think in 10.25 boxes; they think in boxes and pieces.

## The rule

Every quantity on screen, on paper, and in every error message goes through one function:

```ts
import { formatBoxPieces } from '@tiles-erp/shared';

formatBoxPieces(qtyBoxes, piecesPerBox, baseUom === 'PIECE');
```

| Input                      | Output          |
| -------------------------- | --------------- |
| `10.25`, 4 per box         | `10 box 1 pcs`  |
| `10`, 4 per box            | `10 box`        |
| `0.5`, 4 per box           | `2 pcs`         |
| `1`, piece-only product    | `1 pcs`         |
| `0`                        | `0`             |

A piece-only product (`baseUom === 'PIECE'`) never prints the word "box", however its
`piecesPerBox` is set.

## Entry follows the same shape

Where a quantity is typed, there are two inputs — **Box** and **Pcs** — never a single
decimal field. The line converts them:

```ts
const qtyBoxes = boxes + pieces / piecesPerBox;
```

For a piece-only product the Box input is disabled and blanked, and the whole quantity
goes in Pcs. Both the quotation entry grid and the sales invoice dialog do this; copy
that pattern rather than inventing a new one.

## What a contract must carry

Any line type that will be displayed needs the two facts the formatter depends on:

```ts
piecesPerBox: number;
baseUom: ProductUom;
```

These are on `QuotationLineItem`, `SalesOrderLineItem`, `SalesInvoiceLineItem`,
`PurchaseOrderLineItem`, `GoodsReceiptLineItem`, `PurchaseInvoiceLineItem`,
`PurchaseReturnLineItem`, `StockBalanceItem`, `InvoiceableLine` and the stock report
rows. When you add a new document type, include them in the shared type and select them
in the Prisma repository — otherwise the screen has no way to obey this rule.

## Where it applies today

- Quotations: entry grid (including the free-stock column), list, print (A4 and both thermal widths)
- Sales orders: line view (ordered / reserved / pending), shortfall messages on confirm
- Sales invoices: invoice dialog (ordered / pending / ship-from), line view, draw-down
  messages
- Purchase orders, goods receipts, purchase invoices, purchase returns: line views and
  pending quantities
- Stock, stock count, transfers, stock reports, the low-stock on-order drill-down

## Exceptions

Two places legitimately keep a raw number:

- **`qtyBoxes` in an API payload** — the wire format is the decimal; formatting is a
  presentation concern.
- **Stock adjustment entry** (`StockEntryDialog`), where an operator is deliberately
  correcting the box figure itself.

Everywhere else, a decimal box figure on screen is a bug.

## Reading stock is not the same as writing it

Balances are keyed by product, branch, godown, **gate, batch and shade**. Two rules apply
to that key, and confusing them is what makes a godown holding 138 pieces report zero.

**Writing** — an IN movement into gate G, batch B must land on exactly that row. A missing
dimension means the row where it is genuinely null. Exact match, always.

**Reading availability** — a dimension nobody named is not a filter. Asking what a godown
holds, without naming a gate, must count the stock standing at its gates. `null` means
*any*, not *the null one*.

The two are separate helpers in the stock repository (`dimensionWhere` and
`availabilityWhere`) so the distinction cannot be lost by accident.

The same rule governs posting a sales invoice: a line naming only a godown draws across
every gate, batch and shade in it, oldest batch first, writing one movement per row so the
ledger keeps the real dimensions. Name a batch on the line and only that batch is drawn.
