# Tiles ERP — Development Roadmap

Each module ships the full deliverable set: DB schema, Prisma schema, DTOs, validation,
services/handlers, controllers, permissions, API, React pages, forms, grids, unit tests,
integration tests, Swagger, documentation.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Foundation: monorepo, auth infra, guards, Prisma, queues, PWA shells, Docker | ✅ Done |
| 1 | Core Administration: login UI, Users, Roles, Departments, Company, Branch, Godown, Gate, Rack, Settings, Audit viewer | ✅ Done |
| 2 | Master Data: Category, Brand, Series, Collection, Product (UOM/HSN/GST/barcode/shade/batch), Customer, Supplier, Transporter, Vehicle, Driver | ✅ Done |
| 3 | Inventory: movement engine, stock by org/batch/shade, adjustments, transfers, reports | ✅ Done |
| 4 | Purchase: PO, GRN, purchase invoice, landing cost, rate history, returns | ✅ Done |
| 5 | Sales Core: quotation, SO, reservation, allocation, invoice, delivery, collection, ledger | 🔨 In progress |
| 6 | Advanced Sales: split invoice, cross-branch allocation, branch-wise GST, credit approval workflow | 🔨 In progress |
| 7 | Warehouse/Dispatch/Logistics: gate pass, loading, trips, transport charges, POD | 🔨 In progress |
| 8 | Billing & Accounts: payments, receipts, ledgers, GST data | 🔨 In progress |
| 9 | CRM: leads, telecalling, marketing, sales visits | ✅ Done |
| 10 | Portals: supplier portal, customer portal | 🔨 In progress |
| 11 | Reports, Dashboard, real-time Notifications | Planned |
| 12 | SixOrbit integration: masters, product two-way sync, customer lookup-adopt-create, sales-order push, retry queue, sync log | 🔨 In progress |
| 13 | Hardening & go-live: offline flows, barcode, shortcuts, perf, security, e2e, deployment, UAT | Planned |

## Completed sprints

- **1.1** Login + Users / Roles / Departments
- **1.2** Company / Branch / Godown / Gate / Rack (+ bulk gate & rack creation)
- **1.3** Settings, audit capture + viewer, profile & change password
- **2.1** Catalog masters: Category / Brand / Series / Collection
- **2.2** Product master (UOM, HSN, GST, barcode) + purchase rates & landing cost
- **2.3** Customers & Suppliers (GST, contacts, credit/payment terms)
- **2.4** Transporters / Vehicles / Drivers
- **3.1** Stock movement engine: opening stock, adjustments, balances, ledger, bulk count
- **3.2** Stock transfers: godown-to-godown and inter-branch
- **3.3** Stock reports: valuation, ageing, low-stock alerts + CSV export
- **4.1** Purchase orders: drafting, GST-aware totals, approve/cancel workflow
- **4.2** Goods receipts: receive against orders, stock IN, order status roll-up
- **4.3** Purchase invoices: charge apportionment, supplier rate history, landing-cost refresh
- **4.4** Purchase returns: debit notes posting stock OUT
- **5.1** Quotations: branch pricing defaults, minimum-price floor, send/accept/reject
- **5.2**–**5.4** Sales orders, tax invoices and collections
- **6.1**–**6.4** Overview dashboard, GST summary, GSTR-1 export and purchase GST
- **7.1** Gate passes: loading, gate out, proof of delivery
- **8.2** Cash and bank: accounts, expense heads, the cash book, and automatic posting
- **8.3** Day close: driver cash into the drawer, counting note by note, the day lock, and
  handing the takings to an owner
- **8.4** Owner statements, variance trends, and cash on the dashboard
- **11.1** Profit reporting, and a product data audit that catches wrong tile areas
- **9.1** CRM leads: source/stage/owner/expected-value/follow-up pipeline, and one-click
  conversion of a lead into a draft quotation through the existing quotation desk
- **6.6** Price guardrails: one guard across all three documents, and a below-cost rule

## Phase 3 remaining

- **3.3** Stock reports: valuation, ageing, low-stock alerts
- **3.4** Transfer documents: delivery challan or tax invoice by GSTIN, goods in transit,
  receipt with shortage, transport and e-way bill — **done**


## Phase 5 remaining

- **5.2** Sales orders: convert accepted quotations, reserve stock — **done**
- **5.3** Sales invoices: allocation, stock OUT, credit-limit enforcement — **done**
- **5.4** Collections and the customer ledger — **done**
- **6.1** Overview dashboard: today, the period, outstanding and low stock — **done**
- **6.2** GST summary: outward supplies by rate, HSN and place of supply — **done**
- **6.3** GSTR-1 export: the offline tool's workbook, plus a CSV per section — **done**
- **6.4** Purchase GST: inward supplies by rate, HSN and supplier, and input credit set
  against output tax head by head — **done**
- **7.1** Dispatch: gate pass, loading with short-load detection, proof of delivery,
  transporter hire against customer freight — **done**
- **7.2** Trips: several gate passes on one journey, with the hire apportioned across
  them — not started
- **8.1** Supplier payments: tenders and debit-note set-off, allocation by due date, the
  supplier ledger and payables ageing — **done**
- **6.5** Split invoice and cross-branch: allocation preferring the home branch, one
  invoice per supplying branch, branch-wise GST — **done**
- **1.4** Branch-wise document numbering: prefix and financial-year series per branch for
  every document, on an atomic counter — **done**
- **8.2** Cash and bank: many accounts per branch with counted balances, expense heads, an
  append-only book with running balance and day totals, reversal by contra entry, and
  receipts and supplier payments posting into the named account — **done**
- **8.3** Day close: driver handovers landing in the branch drawer, counting a drawer note
  by note against the book, posting the variance, locking the day against anything dated
  behind the count, and handing the takings to an owner while keeping a float back for
  tomorrow — **done**
- **8.4** Owner statement showing where each owner's cash came from and what has left it,
  a variance trend across accounts, and cash position on the Overview dashboard — **done**
- **11.1** Profit: cost frozen on each invoice line at posting, margin by invoice, product,
  branch and salesman, and a product data audit that catches a sq.ft per box which
  disagrees with the tile's own size — **done**
- **6.6** Price guardrails: one guard shared by quotations, orders and invoices — closing
  a gap where invoices enforced no floor at all — plus a below-cost rule kept separate
  from the branch minimum, and a margin floor that warns rather than blocks — **done**

## Phase 9 remaining

- **9.1** CRM leads: the pipeline (source, stage, owner, expected value, next follow-up) and
  conversion of a lead into a draft quotation through the existing quotation desk — **done**.
  See `docs/CRM_LEADS.md`.
- **9.2** Telecalling: call logs with dispositions and callbacks against a lead, where a
  disposition updates the lead's follow-up and stage in the same transaction — **done**.
  See `docs/TELECALLING.md`.
- **9.3** Marketing: campaigns, lead attribution, and a spend-to-return report (cost per
  lead + ROI) measured on the lead's expected value — **done**. See `docs/MARKETING.md`.
- **9.4** Sales visits: field visits scheduled and reported against a lead, where reporting
  a visit updates the lead's follow-up and stage; plus a cross-lead planning queue —
  **done**. See `docs/SALES_VISITS.md`.

## Phase 10 remaining

- **10.1** Supplier portal: a PortalAccount link + admin provisioning, and a scoped supplier
  PWA (orders, invoices, payments) with purchase-order acknowledgement — **done**. See
  `docs/SUPPLIER_PORTAL.md`.
- **10.2** Customer portal: quotations, orders, invoices, receipts and outstanding for a
  customer login, reusing the PortalAccount model — not started.

## Phase 12 remaining

Scope is wider than the original one-line entry. SixOrbit has **no invoice API at all**, so
invoices are raised on their side from a pushed sales order; product sync is genuinely
two-way because `variation/fetch` accepts a `last_updated` filter; and customers are
matched by phone before being created. See `docs/SIXORBIT.md` for the contract, the open
questions and the reasoning.

- **12.1** Foundation: encrypted credentials in the database, the single-endpoint API
  client, the shared session behind a Redis lock, retryable/terminal error classification
  and the append-only sync log, plus a settings screen with a connection test — **done**.
- **12.2** Masters and product import, merged: the client extracted to
  `@tiles-erp/sixorbit` so the worker can run the job, brands and categories taken from the
  variations themselves, a dry run before anything is written, and five data-quality
  warnings that flag a row rather than refusing it — **done**.
- **12.3** Delta scheduling: a repeatable job on `last_updated`, plus real paging once
  SixOrbit documents `limit` / `limit_bit` — not started.
- **12.4** Product push: create and edit a variation, queued off a domain event so the
  products module stays ignorant of SixOrbit, an edit that merges over their own payload
  rather than replacing it, search-before-create against duplicates, and blocked-not-failed
  when a brand or category exists only here — **done**.
- **12.5** Customers: lookup by phone, adopt the existing record or create it, then keep it
  updated — not started. Blocked on confirming their customer search matches phone numbers.
- **12.6** Sales-order push, from which SixOrbit raises the invoice — not started.
- **12.7** Sync console: health tiles, the attempt log with filters and drill-in, CSV export
  and manual retention — **done**, pulled forward ahead of 12.2 so every later sprint is
  observable from its first run. Manual retry and backfill wait on the first queue job.
