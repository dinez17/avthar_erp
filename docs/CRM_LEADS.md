# CRM leads

A lead is a prospective buyer being worked towards a quotation. The module exists for one
thing above all: turning that prospect into a priced document on the quotation desk. A
pipeline that never reaches a quotation is just a spreadsheet, so conversion is a
first-class action here, not an afterthought.

## What a lead carries

The board is run on five things, and the model keeps exactly those front and centre:

- **Source** — where the lead came in from (walk-in, phone, referral, website, exhibition,
  social media, advertisement, other), for source-of-business reporting.
- **Stage** — where it sits in the pipeline.
- **Owner** — the salesperson or telecaller responsible, stored by user id with a name
  snapshot for the board.
- **Expected value** — what the deal is thought to be worth, used to weight the pipeline.
- **Next follow-up** — when the owner should next chase it; an open lead whose date has
  passed is flagged overdue.

Alongside these it holds a contact (name, company, phone, email, city), an optional link to
an existing customer master, the branch working it, and free-text notes.

Reference columns (customer, branch, owner, converted quotation) are plain ids with a name
snapshot beside them — the same approach a quotation takes with its salesman and customer.
The lead reads as itself in history after a master record is edited or removed, and the CRM
module owns no foreign keys into records another module manages.

## Pipeline

```
NEW ──► FOLLOW_UP ──► CONVERTED
             │
             └──────► NOT_INTERESTED
```

- **NEW / FOLLOW_UP** are the open stages a lead is moved through by hand
  (`PATCH /leads/:id/stage`).
- **CONVERTED** is reached only by conversion — it can never be set by hand. This keeps the
  stage honest: a lead is "converted" precisely when a quotation exists for it.
- **NOT_INTERESTED** is the dead-end. Marking a lead not interested requires a reason, kept
  for win/loss analysis.

## Conversion is the point

`POST /leads/:id/convert` raises a **draft quotation** for the lead and stamps the lead as
converted (stage → CONVERTED, the quotation linked one-to-one on `convertedQuotationId`).

Crucially, conversion does **not** re-implement pricing. It carries the lead's context —
customer, branch, owner, contact — and hands the products the salesperson has chosen to the
existing quotation desk (`CreateQuotationCommand`). That desk applies the branch selling
price, enforces the branch minimum-price floor and the below-cost rule, and honours the same
pricing rights the person holds when quoting directly. There is one pricing path in the
system, and CRM uses it rather than growing a second.

The person converting therefore needs the quotation desk's latitude: `crmLead:convert`
opens the document, and their `quotation:overridePrice` / `sales:sellBelowCost` rights
decide whether they may go below the floor. Credit is not part of a quotation, so no credit
right is taken at conversion.

A lead can only be converted once — `convertedQuotationId` is unique, and a second attempt
is refused. After conversion the new draft opens for final edits and can be sent, accepted
and turned into an order through the normal sales flow.

## Permissions

| Permission | Grants |
| --- | --- |
| `crmLead:read` | List, view, pipeline board |
| `crmLead:create` | Create a lead |
| `crmLead:update` | Edit a lead and move its stage |
| `crmLead:delete` | Soft-delete a lead |
| `crmLead:convert` | Convert a lead into a draft quotation |

`SUPER_ADMIN` and `ADMIN` hold all of them. `MANAGER` runs the pipeline end to end,
conversion included. `STAFF` (salespeople and telecallers) may create, read, update and
convert, but not delete.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/leads` | List, filter by stage/source/owner/branch and follow-up-due, search |
| `GET` | `/leads/pipeline` | Counts and weighted value per stage |
| `GET` | `/leads/next-code` | Suggest the next sequential code (LEAD-000042) |
| `GET` | `/leads/:id` | One lead |
| `POST` | `/leads` | Create |
| `PATCH` | `/leads/:id` | Edit the lead's own fields (not stage) |
| `PATCH` | `/leads/:id/stage` | Move along the pipeline (never to CONVERTED) |
| `POST` | `/leads/:id/convert` | Convert to a draft quotation |
| `DELETE` | `/leads/:id` | Soft-delete |

All writes are optimistic-concurrency guarded by `version`, soft-deleted, and audited like
every other master in the system.
