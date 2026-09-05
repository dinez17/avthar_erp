# Stock transfers

Moving stock between godowns, and the paper that travels with it.

Sidebar → **Stock transfers**.

## The document decides itself

You do not choose between a challan and a tax invoice. The two branches' GSTINs do:

| Situation | Document | Tax |
| --- | --- | --- |
| Both godowns under one GSTIN | **Delivery challan** | None — this is not a supply |
| The two branches have different GSTINs | **Tax invoice** | Charged, and it goes into GSTR-1 |
| Either branch has no GSTIN saved | **Delivery challan** | None |

The reasoning: moving your own stock between your own godowns is not a supply, because
there is no second person for it to be supplied to. It goes on a delivery challan under
Rule 55, which states a value for the road but charges nothing.

Two branches registered separately are two *persons* under GST, even inside one company.
A move between them is a supply, so it needs a real tax invoice — it appears in the
sending branch's GSTR-1 and gives the receiving branch input credit. See
[PURCHASE_GST.md](PURCHASE_GST.md) for where that credit lands.

When a branch has no GSTIN on file it cannot be a separate registration, so the safe
answer is the challan. Issuing a tax invoice on a transfer that was never a supply
overstates your outward supply, and that is much harder to unwind than the other mistake.

The document type is **frozen when the transfer is dispatched**. Adding a GSTIN to a
branch tomorrow does not rewrite paper that was handed to a driver today.

### Two number series

Challans run `DC-2026-00001`, transfer tax invoices run `STI-2026-00001`, counted
separately. A tax invoice has to sit in a continuous series of its own — a gap in it is a
question at assessment time, and interleaving challans would guarantee gaps.

The `TRF-…` number still exists underneath as the internal reference. Search accepts
either, plus the LR and e-way bill numbers, because whoever is on the phone is reading
whichever piece of paper they are holding.

## Goods in transit

A transfer now moves in two steps, and this is a change from how it used to behave:

1. **Dispatch** — stock goes OUT of the source godown. The transfer is `In transit`.
2. **Receive** — someone at the destination counts it in, and stock goes IN there.

Between the two, the goods are on a lorry and belong to **neither godown's balance**.
That is the point. Pretending stock arrives the instant it leaves is exactly what hides a
short delivery, and tiles arrive broken.

The **In transit** filter is your worklist: anything sitting there is either still on the
road or was never booked in.

### Receiving short

The receive screen opens with every line pre-filled at what was sent, because a full
delivery is the normal case and retyping twenty quantities to say "all fine" is how wrong
numbers get entered. Change only the lines that arrived short.

What did not arrive is **not posted anywhere**. It left the source and never reached the
destination, and the ledger already says exactly that. Writing it back would invent stock
that is lying broken on a roadside. The shortfall stays visible against the transfer, on
the list and on the printed acknowledgement.

A received transfer is closed. Correcting a miscount afterwards is a stock adjustment
against the destination godown, with its own reason — not a second receipt, which would
post the same goods in twice.

### Turning one back

Cancel while in transit and the stock posts home to the source godown as a **fresh IN
movement**, not as a reversal. The ledger is append-only: what left is a fact, and the
lorry coming back is a second fact. A reason is required, and it prints on the record.

## Valuation

Lines are valued at the product's **landing cost**, which is what the stock actually cost
you and is the value a challan should state. The rate is editable per line for the rare
consignment that has to be declared at something else, and whatever is used is copied onto
the line — a later purchase cannot rewrite a document already issued.

On a tax invoice the GST rate comes off the product, and the split follows the two
branches' state codes: same state, CGST + SGST; different states, IGST.

## Transport and the e-way bill

Transporter, vehicle and driver are picked from the same masters the gate pass uses;
leave the transporter blank for your own lorry. `LR number` is the transporter's own
consignment note. `Freight cost` is what the lorry costs **you** — a cost of moving your
own stock, billed to nobody, unlike the freight on a gate pass.

The consignment value updates live as lines are added. Cross **₹50,000** and the e-way
bill field turns red: generate the bill on the portal and record its number here so the
two can be reconciled. The list flags any transfer over the threshold with no number
against it.

The threshold is the central figure. States can set their own floor for movement wholly
inside one state, so check yours.

## The printed document

`Print` from the list or the detail dialog. A4, one page:

- Consignor and consignee blocks, each with its godown and GSTIN
- Transporter, vehicle, driver, LR number, distance and e-way bill
- Lines with HSN, quantity, rate and value
- Tax block — only on a tax invoice
- Amount in words, and on a challan the line *"Value stated for transport purposes only.
  This is not a supply and no tax is charged."*
- A signature block for the receiving godown, which fills itself in with the name, date
  and any shortage once the transfer is received

Reprint after receipt and the acknowledgement is on the paper — so the file copy shows
what arrived, not just what was sent.

## Permissions

| Action | Permission |
| --- | --- |
| See transfers | `stock:read` |
| Dispatch one | `stock:transfer` |
| Receive at the destination | `stockTransfer:receive` |
| Turn one back | `stockTransfer:cancel` |

The two new ones arrive with `pnpm prisma:seed` — until that runs, the Receive and Turn
back buttons will refuse.

## Troubleshooting

**Stock has not appeared at the destination.** The transfer is still in transit. Filter
the list to `In transit` and receive it.

**It raised a tax invoice and I expected a challan.** The two branches have different
GSTINs on file. Check the branch masters — most often one of them has a stale or
mistyped GSTIN.

**The tax split is wrong on a transfer invoice.** The state codes on the two branches
decide CGST+SGST against IGST. The total will be right and the heads wrong.

**Receive says "no longer in transit".** Somebody else received or cancelled it while the
dialog was open. Reload the list to see which.

**A line will not accept the quantity that arrived.** More cannot arrive than was sent. If
the destination genuinely counted more, that is a counting error at one end — receive what
was sent and post an adjustment.
