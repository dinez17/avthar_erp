# Cash and bank

One append-only book. Every rupee that moves — collected, paid, spent, or shifted between
a drawer and a bank — is a row in it.

Sidebar → **Cash & bank**.

## Accounts

A branch holds as many accounts as it needs: the counter drawer, and a row per bank it
deals with.

| Code | Name | Type | Branch |
| --- | --- | --- | --- |
| `HO-CASH` | Head Office counter | Cash | Head Office |
| `HO-AXIS` | Axis Bank — 5521 | Bank | Head Office |
| `HO-HDFC` | HDFC Bank — 9043 | Bank | Head Office |
| `AMB-CASH` | AM Build Mart counter | Cash | AM Build Mart |
| `CO-OWNER` | Rajesh Patel | Owner | — |

Bank rows carry bank name, account number and IFSC. Each account has its own opening
balance, its own opening date, and its own book.

A cash drawer must belong to a branch — a drawer with no branch belongs to nobody. A bank
account may be company-level, which is what leaving the branch blank means.

An **owner** account holds cash handed over at day close. It belongs to no branch on
purpose: the same person takes money from more than one counter, and splitting them into a
row per branch would leave a balance nobody could read. See
[Handing the takings to an owner](#handing-the-takings-to-an-owner).

The page groups by branch and totals each, because that is how the question is actually
asked: *what does Head Office have*, not *list every bank account we own*.

## Balances are counted, never stored

An account's balance is its opening plus every entry since. Nothing caches it.

This is the same rule stock follows, for the same reason: a stored figure and a ledger
disagree eventually — a mis-posted correction, a rolled-back transaction — and only the
ledger can be audited, so the ledger decides.

Two consequences, both deliberate:

- **An account with entries cannot be deleted.** Its history would lose its home. Close it
  instead; closed accounts are hidden unless you ask for them.
- **Its opening balance is fixed once entries exist.** Changing it would silently restate
  every balance since, with nothing on screen to say why. Post an adjusting entry.

## Transfers write two rows

Moving money from the drawer to the bank writes an OUT on `HO-CASH` and an IN on
`HO-AXIS`, linked to each other — not one row with a sign.

Each account's book has to read correctly on its own. The bank statement shows a deposit
and the drawer shows a withdrawal, and neither needs the other's side to balance.

## Expense heads

What an expense was for: rent, fuel, wages, tea. Company-wide, not per branch — the same
rent head serves every branch, and splitting it per branch would make the year's spend
impossible to add up.

Each head shows what has been spent under it in the current financial year. A head that
has been used cannot be deleted, only retired.

## The book

Sidebar → **Cash book**. Pick an account and a period.

```
Opening balance                                     15,000.00
14/08  CE/26-27/0007  Shop rent        Expense    −  8,000.00   7,000.00
15/08  RCPT/26-27/0031  Kumar Tiles    Receipt    +  40,000.00  47,000.00
15/08  PAY/26-27/0012  Sunrise Ceramics Payment   −  25,000.00  22,000.00
Closing balance                                     22,000.00
```

Opening is what the account held the moment before the period began: its opening balance
plus everything earlier. The balance column carries down the rows beside it, in date then
entry order — sorted once, then trusted, so the number against each row is the number that
was true when it was written.

Below the book, **where the money is** totals every account on the closing date, split
between cash and bank. That is the question people actually open this page to answer.

**CSV** exports what is on screen.

## Typing an entry

**New entry** covers four shapes of the same row:

| | What it is | Direction |
| --- | --- | --- |
| Expense | Money spent, under a head | Out |
| Money in | Cash or a credit not tied to an invoice | In |
| Money out | A payment not tied to a supplier bill | Out |
| Transfer | Between two of your own accounts | Both |

An expense must name a head. A transfer must name two different accounts.

**A cash drawer cannot go negative.** A drawer holding 5,000 cannot pay out 6,000, whatever
the books say, because the notes are not there. The dialog says so as you pick the account,
and the server refuses it again. A bank account *can* go below zero — that is what an
overdraft is, and refusing it would block legitimate payments.

## Correcting a mistake

There is no edit and no delete. Reversing writes the mirror image of the entry beside it
and links the two: the original stays on the page struck through, the contra sits below it,
and the balance ends where it started.

A book that can be rewritten is not a book. The correction has to be as visible as the
mistake, or a balance that changed overnight has nothing on the page to explain it.

Reversing one leg of a transfer takes the other with it. Half a reversal would leave money
that exists in one account and not the other.

**Both rows count towards the balance.** They cancel each other. This is worth stating
because the obvious alternative — dropping reversed rows from the sum — takes the money off
twice, once by hiding the original and once by counting the contra.

## Receipts and payments post themselves

Each tender on a customer receipt or a supplier payment names one of your accounts:

- **Collections** → *Into account*. Posting the receipt writes an IN on that account.
- **Supplier payments** → *Out of*. Posting writes an OUT, and the balance is shown beside
  each account in the picker so paying 80,000 out of a drawer holding 12,000 is caught
  before the request rather than after.

The picker offers this branch's accounts of the matching kind, plus any company-wide ones —
cash lands in a drawer, a cheque lands in a bank account. With one drawer and one bank
account per branch, the row fills itself in.

Writing happens inside the same transaction that posts the document. A supplier payment
that would overdraw the drawer fails whole; it does not post the bill as settled with cash
that was not there. Cancelling writes a contra, so the money comes back out of the account
it went into.

A tender left as **not recorded** still settles the invoice — it just stays out of the cash
book. Receipts raised before accounts existed are in exactly that state, which is why the
field is optional rather than required.

## Driver cash

Taking money off a driver at the counter names a drawer — **Into drawer** on the handover
dialog. The notes are already being counted; recording the till puts them straight into its
book rather than making someone type the same figure again on the cash entry screen, which
is where two records start to disagree.

Only that branch's cash accounts are offered. The driver is standing at the counter with
notes in his hand; a bank account is not where they go.

Reversing a handover writes a contra row. The handover is removed and the money goes back
to the driver's balance, but the book keeps both rows — the cash was in the till for a
while, and erasing that would leave the day's count unexplainable.

## Day close

Sidebar → **Day close**. Permission `cashCount:close`.

```
The book says     14,900.00
Counted           14,650.00
Difference          −250.00   short
```

Pick an account and it offers the next day still open: the day after the last close, or
today if nothing has been closed yet.

**A drawer is counted note by note.** ₹2,000 down to ₹1, and the total is what the notes add
up to — it cannot be typed over. A figure entered directly is a figure someone worked out in
their head, and catching that arithmetic is the entire point. A bank account has no notes,
so it is reconciled against the statement balance instead.

### Handing the takings to an owner

Below the count, **Hand over the takings**:

```
Counted                                  1,02,500.00
To          Rajesh Patel
Amount                                   1,00,000.00
The drawer opens tomorrow with               2,500.00
```

Each owner is an account of type **Owner**, added on the Cash & bank screen. The handover
writes a transfer: the drawer's book shows the money leaving, the owner's shows it
arriving, and the owner's balance says how much they are holding.

That is the point of giving owners accounts rather than writing the cash off. The money is
still the company's — it has moved, not vanished — and with several owners taking cash on
different nights, "who has what" is a question somebody will ask.

When an owner banks it later, that is an ordinary transfer from their account into the bank
account, on the cash book's **New entry → Transfer** tab.

### The float

Each drawer carries a **Keep back at day close** figure — set it on the Cash & bank screen.
The suggested handover is the count less the float, **rounded down to the nearest 100**, so
nobody is left counting coins into an envelope at closing time. 1,02,500 with a 2,500 float
suggests 1,00,000; 1,02,487 suggests 99,900 and leaves 2,587.

The amount is editable. Type over it if tonight is different — the suggestion stops
recalculating once you do.

Leave the float at zero and the whole drawer is offered. Hand over nothing and the drawer
simply opens tomorrow with what it closed with.

### Owner money is not cash in the tills

The position totals read **Cash · Bank · With owners**. Money handed to an owner is counted
in the company total but kept out of the cash figure, because "how much can the counter pay
out today" should not include notes sitting in somebody's house.

### Posting the difference

**Post the difference** writes an adjusting entry so the book matches the count — a drawer
short by 250 gets 250 taken out of the book, because the book is the thing that is wrong and
the count is the thing that is true.

Leave it off while someone is still looking for the missing note. The variance is recorded
either way; the switch only decides whether the book moves today.

### The lock

Once a day is closed, **nothing can be dated on or before it** for that account. Receipts,
supplier payments, expenses, transfers — all refused, with the close date in the message.

That is what a close is for. Letting an entry land behind a count makes the count false
without changing the paper it was written on.

The lock is per account: closing the Head Office drawer does not lock the Axis account.

### Reopening

Permission `cashCount:reopen`, deliberately separate from closing — a clerk counts, a
supervisor unlocks.

The close is never deleted. It stays on the page marked **Reopened**, a fresh close is made
beside it, and a day that was counted twice says so.

Everything it wrote is reversed with contra entries — the adjustment, and **both legs of any
handover**. The owner gives the money back on paper, because a count that no longer stands
cannot be what justified handing it over.

Only the most recent close can be reopened. Reopening an older one would leave a day
writable underneath a later count that has already been signed off.

## Owner statement

Sidebar → **Owner statement**.

Top of the page, every owner on one line — opening, taken, paid out, holding now, and what
they hold between them. Click a row for that owner's statement:

```
Opening        Taken       Banked    Other payments   Holding now
  25,000    1,00,000     1,00,000          5,000         20,000
```

**Taken** is broken down by the drawer it came from, with a count of handovers — so
"1,00,000 from AM Build Mart counter across 4 handovers" rather than a single figure the
owner has to take on trust. Below that, every movement with a running balance, which is
what makes the total followable rather than merely stated.

**Banked** and **other payments** are split deliberately. Cash that reached a bank account
is accounted for; cash that went anywhere else — a supplier paid in cash, an expense met
personally — is the part someone will be asked about, and the page says so.

**CSV** exports the movements.

### Reversed entries are netted out

An entry and the contra that cancelled it net to nothing, so **neither is shown by
default** — on the cash book or the statement.

This matters more than it sounds. An owner who took 3,000 and had two earlier handovers
reversed would otherwise read as *taken 1,00,000, other payments 7,000, holding 3,000* —
three true figures that together describe bookkeeping rather than what happened. Only the
last one is the answer to the question being asked.

**Show reversed** puts them back, struck through with their contra beside them, and the
totals and running balance recompute to match. A line under the filters says how many are
hidden, so nothing disappears quietly.

The pair is found through the link written when the contra was created, not by matching
amounts — two entries of the same size on the same day are ordinary, and guessing which
cancelled which would eventually guess wrong.

## How the counts have gone

At the bottom of **Day close**, one line per account over a period: days counted, days
balanced, days short, days over, the net, and the single worst day.

A drawer that is short once is a mistake. The same drawer short most weeks is something
else, and only a run of days tells the two apart — which is the reason a count is written
down rather than just corrected and forgotten. The panel flags an account short three days
or more.

Reopened closes are left out. They were replaced by a fresh count, and carrying a withdrawn
figure into a trend would show a shortfall that was already corrected.

## On the dashboard

**Cash in tills** and, when owners are holding anything, **With owners** sit alongside the
sales figures on Overview, each linking through to the page behind it.

They are fetched from the cash book rather than folded into the dashboard's own response.
It is a different question — *where is the money right now* rather than *how did the period
go* — and merging them would tie the sales dashboard to the cash module for no gain.

## Still to come

- Approval on a handover, so an owner acknowledges what they took.
