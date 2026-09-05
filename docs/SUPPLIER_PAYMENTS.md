# Supplier payments and payables

The money going out. This is the mirror of [collections](COLLECTIONS.md), with one
addition that the customer side does not have.

Sidebar → **Supplier payments**, **Payables**, **Supplier ledger**.

## Cash and credit both settle a bill

A customer settles with money. A supplier account is settled two ways:

- **Cash** — a tender that actually leaves your bank: transfer, cheque, UPI, card, notes.
- **Credit** — a debit note. Goods you sent back are credit sitting with that supplier,
  and spending it clears a bill just as money does. It simply never leaves the bank.

So a payment carries **tenders** and **set-offs**, and the two together are what it can
allocate to bills. A payment of nothing but a debit note is perfectly valid — that is the
"adjust my debit note against bill 902" conversation, recorded.

## Draft, then post

A payment is saved as a draft first and posted second. Posting is what actually moves
money onto bills and spends the credit; before that it is a piece of paper. A cheque
written by mistake is far easier to delete as a draft than to unwind afterwards.

**Cancel** on a posted payment puts everything back: the bills return to owing what they
did, and the debit notes get their credit back.

## Allocation runs by due date

As you type an amount, it fills the bills **falling due soonest** — not the oldest bill.
This is where payables part company with receivables: a supplier on 60 days can bill you
before one on 7 days who still needs paying first. Every amount is editable; type over
any of them.

A bill with no due date was payable on sight, so it sorts as if due on its own date.

Anything not allocated sits as an **advance** against the supplier, shown as *on account*.
It is not forced onto a bill, because an advance is a real thing — you paid ahead, and the
next bill will absorb it.

## Payables

What you owe, per supplier, in five columns aged **from the due date**. A supplier on 60
days who billed you last month is not late; one on 7 days who billed you a fortnight ago
is. The report answers the question you actually have: what has to be paid, and what can
wait.

**Credit** is unspent debit notes, shown in green. That much of the balance will not need
cash — it is money you are owed back and easy to forget about.

CSV export, and the statement icon jumps straight to that supplier's ledger.

## The supplier ledger

The statement, with the signs the opposite way round from a customer's, because a supplier
is a **creditor**:

| Entry | Effect | Column |
| --- | --- | --- |
| Purchase invoice | You owe more | Credit |
| Debit note (goods returned) | You owe less | Debit |
| Payment | You owe less | Debit |

A positive balance means you owe them.

**A debit note appears once**, as the note itself. Spending it on a payment is not a
second entry — if both showed, the same credit would count twice and the statement would
never agree with the supplier's own.

Only the cash leg of a payment appears for the same reason.

Anything before the From date folds into the opening balance, so a dated statement still
adds up.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /supplier-payments` | The list, filterable by supplier, branch and status |
| `GET /supplier-payments/open-bills` | Bills still owing, soonest due first |
| `GET /supplier-payments/open-debit-notes` | Debit notes with credit left |
| `GET /supplier-payments/due` | Payable, overdue, credit and advances for one supplier |
| `GET /supplier-payments/ledger` | The statement |
| `GET /supplier-payments/payables` | The ageing report |
| `POST /supplier-payments` | Draft a payment |
| `POST /supplier-payments/:id/post` | Settle the bills, spend the credit |
| `POST /supplier-payments/:id/cancel` | Put it all back |

## Permissions

| Action | Permission |
| --- | --- |
| See payments | `supplierPayment:read` |
| Draft one | `supplierPayment:create` |
| Edit a draft | `supplierPayment:update` |
| Post | `supplierPayment:post` |
| Cancel | `supplierPayment:cancel` |
| Delete a draft | `supplierPayment:delete` |
| Ledger and payables | `supplier:ledgerRead` |

All new — run `pnpm prisma:seed` or the pages will refuse.

## Troubleshooting

**"The bills allocated add up to more than the payment is worth."** The allocations
exceed cash plus credit. Either add a tender, tick another debit note, or reduce what you
are settling.

**A bill will not accept the full amount.** It has less outstanding than you typed —
someone has already part-paid it. The figure shown in the *Outstanding* column is live.

**A debit note is not in the list.** Only **posted** returns carry credit, and only until
it is spent. Check the return is posted and has credit left.

**The supplier's statement does not agree with theirs.** The usual causes, in order: a
bill still in draft on your side; a debit note they have not accepted; an advance you paid
that they have applied to a bill and you have not. The *on account* figure on the payment
list is where that last one hides.

**Payables shows a supplier with credit but no balance.** They owe you. Nothing to pay,
but the credit is still there to spend on their next bill.
