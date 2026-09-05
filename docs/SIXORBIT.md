# SixOrbit integration — Phase 12 plan

SixOrbit is the accounting and invoicing system the business already runs at
`avthar.sixorbit.com`. Phase 12 makes TilesERP and SixOrbit agree on three things —
customers, products and orders — so that a sale keyed once in TilesERP ends up invoiced in
SixOrbit without anyone typing it twice.

This document is the plan. It is written before the code, so the parts marked **OPEN** are
genuinely unresolved and are called out rather than guessed at.

---

## 1. What their API actually is

Not REST. One endpoint, dispatched by a query-string `task`:

```
http://avthar.sixorbit.com/?urlq=service&version=<v>&key=123&task=<task>&user_id=<id>&access_token=<tok>&...
```

Seven facts drive the whole design, all confirmed from the Postman collection at
`docs/sixorbit-api/SixOrbit API.postman_collection.json` and from live probes:

1. **Auth is two query params** — `user_id` and `access_token`, obtained from `task=login`.
   No headers, no cookies. The token is stable, not rolling: the same token worked hours
   later and did not rotate between calls.
2. **`version` varies per task** — `1.0` on older ones, `4.0` on newer. It belongs in a task
   registry, not a constant.
3. **POST bodies are multipart form-data with one field, `data`**, holding a JSON string.
   Customer tasks send a JSON object; `variation/*` tasks send a JSON **array** of one
   object.
4. **Errors return HTTP 200.** Every response is `{success, data, result_code, message}`.
   Branching on HTTP status would treat every failure as a success.
5. **`result_code` is not a status on its own.** `20004` appears as both `success:true`
   (`chat/info`) and `success:false` (`notification/feed`). The `success` boolean is the
   only safe primary; `result_code` classifies a known failure once we already know it
   failed.
6. **Every id is a string and several exceed JavaScript's safe integer range**
   (`access_token: "4132755283700536452"`). Parsing one to a number silently corrupts it.
   Ids are `string` end to end.
7. **The server drops valueless params and 302-redirects to a canonical alphabetical param
   order.** URLs are built pre-sorted with empty params omitted, or every call pays for a
   redirect.

### Security

**Secrets are in the URL.** The password goes in the query string on `login`, and the
`access_token` on every call after it. Two consequences, both handled:

- Nothing may log a raw request URL. The client redacts `password` and `access_token`
  before anything reaches the logger or the sync log, and the sync console shows only the
  redacted form.
- **Use `https://` for the base URL.** The tenant answers over HTTPS
  (confirmed against `https://avthar.sixorbit.com` — 200, ~470ms). On plain HTTP those
  credentials cross the network in cleartext, so the settings screen warns when the base
  URL starts with `http://`.

> An earlier draft of this document claimed the tenant forced plain HTTP, on the strength
> of a `302` seen through a tool that rewrites HTTP to HTTPS. That was wrong, and it is
> recorded here rather than quietly deleted because the wrong conclusion would have meant
> shipping the integration unencrypted.

---

## 2. Gating questions — answer before 12.1 starts

| # | Question | Blocks | Why it matters |
| --- | --- | --- | --- |
| G1 | The `variation/fetch` response body — run it in Postman and paste one complete variation object | 12.3 | The product import is written against this shape. Guessing it means rewriting it. |
| G2 | Does `quotation_search_customer`'s `search` param match **phone numbers**, or only names? | 12.5 | The whole customer flow is lookup-by-phone. If search is name-only the flow needs a different task. |
| G3 | Do their variations carry **pieces-per-box** and **sq.ft-per-box** in any field? | 12.3 | Our `Product` requires both; pricing, stock movements and the sq.ft audit depend on them. If absent, imported products land incomplete. |
| G4 | Is there an **HTTPS** endpoint? | go-live | See above. |
| G5 | Are there **master-creation** tasks (add brand / category / attribute) outside this collection? | 12.4 | Without them, a brand invented in TilesERP can never push a product. |
| G6 | Once an order is pushed, is there **any** task to read back the invoice they raise from it? | 12.6 | Decides whether 12.6 is fire-and-forget or a real round trip. |

G1 and G2 are hard blockers. The rest shape scope but work can start around them.

---

## 3. Decisions already taken

- **Credentials live in the database**, editable at runtime without a redeploy — but the
  password is **encrypted at rest**, never in the plaintext `Setting` table.
- **Invoices**: SixOrbit raises them. We push the **sales order**
  (`chkorder/create_order_submit`); their side invoices, with IRN and e-way bill. There is
  no invoice task in their API at all.
- **Products**: pull first, then push. Import their whole catalogue as the initial load,
  then auto-sync on create in TilesERP.
- **Customers**: on create, look up by phone; adopt the SixOrbit record if it exists,
  otherwise create it there and adopt what comes back.
- **Scope**: one SixOrbit account for all branches. Their account has exactly one outlet
  (`410000357`, code `AVT`, "Avthar Ceramics, Theni"), so our Branch dimension has no
  counterpart on their side.

### The build order is forced

`chkorder/create_order_submit` needs `cuid` (customer), per-line `isvid` (product), and
master ids for charges. Products need brand and category ids. So:

```
masters  →  products  →  customers  →  orders
```

Nothing later can be tested until everything earlier is mapped. The sprints follow that
order exactly, and each one ships something usable on its own.

---

## 4. The sprints

Each sprint ships the full deliverable set required by `CLAUDE.md`: schema, Prisma, DTOs,
validation, handlers, controllers, permissions, API, pages, forms, grids, unit tests,
integration tests, Swagger, docs.

### 12.1 — Foundation: config, client, sync log, retry queue

The plumbing every later sprint sits on. Nothing business-facing ships, but the sprint ends
with a working **Test connection** button, which proves the hardest part (auth) end to end.

**Schema**

```
SixOrbitConfig
  id, baseUrl, apiKey, email
  passwordCipher, passwordIv, passwordTag     -- AES-256-GCM
  accessToken, tokenUserId, tokenFetchedAt    -- cached session
  isActive, + standard audit fields

SixOrbitSyncLog
  id, entityType (CUSTOMER|PRODUCT|MASTER|SALES_ORDER)
  entityId, task, direction (PUSH|PULL)
  attempt, success, resultCode, message
  requestSummary (redacted), requestBody (the posted JSON, redacted, 4 KB)
  responseBody (4 KB), durationMs, jobId, createdAt
  @@index([entityType, entityId]) @@index([success, createdAt])
```

**Backend**

- `SixOrbitCryptoService` — AES-256-GCM, key from `SIXORBIT_ENC_KEY` in env. The key stays
  in env deliberately: a stolen database alone must not yield the password.
- `SixOrbitClient.callTask(task, opts)` — the single choke point. Sorted-and-pruned URL
  builder, per-task `version` from a registry, native `fetch` with `AbortController`
  timeout, multipart `data` field for POSTs, envelope parsing on the `success` boolean, and
  redaction before logging. No new HTTP dependency; the repo has none and doesn't need one.
- `SixOrbitAuthService` — login, token cached in Redis under a lock so the API and the
  worker share one session rather than racing, re-login once on rejection then fail.
- `SixOrbitSyncLogService` — one row per attempt, written by the client itself so no caller
  can forget.
- **Error classification** — because everything is HTTP 200, a small table maps
  `result_code` to *retryable* (network, timeout, auth) or *terminal* (validation,
  duplicate). Retryable goes back on the queue; terminal goes to the dead letter and waits
  for a human.
- `sixorbit` BullMQ queue registered in the API and processed in `apps/worker`, with the
  repo's existing exponential backoff.

**Frontend** — a settings page under `sixorbit:configure`: base URL, key, email, password
(**write-only** — settable, never readable back), and **Test connection**, which logs in and
reports the outcome.

**Permissions** — `sixorbit:configure`, `sixorbit:read`, `sixorbit:sync`.

**Tests** — crypto round-trip; URL builder sorts and prunes; envelope parser treats
`success:false` with HTTP 200 as failure; `20004` is not read as success; redaction removes
password and token; token lock serialises concurrent logins.

**Done when** credentials save from the UI and Test connection succeeds against the live
tenant.

---

#### 12.1 as built

| Piece | Where |
| --- | --- |
| Credentials, encrypted | `SixOrbitConfig` (Prisma), `infrastructure/sixorbit-crypto.service.ts` |
| URL building and redaction | `domain/sixorbit-url.ts` |
| Envelope reading, failure classification | `domain/sixorbit-envelope.ts` |
| Per-task version and body shape | `domain/sixorbit-task.ts` |
| Transport + unskippable logging | `infrastructure/sixorbit-http.service.ts` |
| Shared session behind a Redis lock | `infrastructure/sixorbit-auth.service.ts` |
| The door later sprints use | `infrastructure/sixorbit.client.ts` |
| Settings screen and connection test | `admin-pwa/src/features/sixorbit/` |

Endpoints: `GET /sixorbit/config`, `PUT /sixorbit/config`, `POST /sixorbit/test-connection`
(all `sixorbit:configure`), `GET /sixorbit/sync-log` (`sixorbit:read`).

Three decisions worth knowing about:

**The password can be written but never read.** `GET /sixorbit/config` returns
`hasPassword: boolean` and no password field, so the secret cannot leak through an API
response, a browser cache or a screenshot of the settings page. Saving without a password
leaves the stored one alone; a blank box means "unchanged", not "erase".

**Saving the settings clears the cached session.** A new URL or password makes the old
token meaningless at best and pointed at the wrong tenant at worst.

**Test connection always returns HTTP 200.** A refused login is an ordinary answer to the
question being asked, and belongs in a red panel on the page rather than in an error
handler.

#### 12.7 as built (pulled forward)

Built ahead of 12.2–12.6 rather than after them. It needs nothing from SixOrbit — the log
table already existed — and having it in place first means every later sprint is
observable from its first run, instead of being debugged through server logs. Doing it
last was the wrong order.

`GET /sixorbit/sync-log/health` (`sixorbit:read`) and `DELETE /sixorbit/sync-log`
(`sixorbit:configure`), plus free-text search on the list. The console lives at
**SixOrbit → Sync console**.

Three things it gets right that are easy to get wrong:

**Attempt counts are windowed; "last succeeded" is not.** A window that happens to contain
no successes would otherwise read exactly like a module that has never worked. The
question worth answering is "when did this last work at all", so that one ignores the
window.

**Records stuck counts records, not attempts.** One customer that failed six times is one
problem, and a record that failed and then succeeded is not a problem at all. It comes from
a `DISTINCT ON` over the latest attempt per record — the real definition of a dead letter.

**Pruning is manual.** The log grows by a row per attempt and a catalogue pull is thousands
of them, so something has to remove history eventually — but nobody should discover that
last month's evidence was swept away by a default they never chose. Minimum retention is
7 days, so a mistyped `0` cannot erase an investigation in progress.

**Not in 12.7:** no manual retry button. Retrying means re-enqueuing a job, and no job kinds
exist until 12.2. It arrives with the first one.

**Not in 12.1:** there is no worker processor yet. The queue is registered so 12.2 can
enqueue against it, but nothing produces or consumes a job — a processor with no job to
process would be exactly the placeholder code `CLAUDE.md` rules out. It arrives in 12.2
alongside the master import, which is the first real unit of background work.

### 12.2 — Master import

Their brands, categories and attributes, mirrored locally with their ids attached. Small
sprint, but it is what makes every later mapping automatic instead of manual.

- `variation/fetch_brand`, `variation/fetch_category`, `variation/fetch_atttribute` (their
  typo — three t's — matched exactly).
- `sixorbitId` added to `Category` and `Brand`; a `SixOrbitAttribute` table for
  `{aid, avid}` pairs, which have no local counterpart.
- Import is idempotent on `sixorbitId`, safe to re-run.
- A read-only **Masters** tab showing what is mapped and what is not.

**Done when** every Category and Brand that exists in SixOrbit carries its id locally.

---

#### 12.2 as built — masters and products, in one sprint

The three master endpoints turned out not to be needed. Every variation carries
`brand_id`, `category_id` and its `attributes` pairs, so the mapping is built from the
products themselves and cannot drift out of step with them. `fetch_brand` and
`fetch_category` remain unused, and are only worth wiring for masters that have no
products.

**The client moved.** `@tiles-erp/sixorbit` now holds the domain and the client as plain
classes, because the import runs on the queue, the queue is consumed in `apps/worker`, and
the worker cannot import from `apps/api`. Both applications construct the same classes and
supply two small adapters — `SixOrbitCache` and `SixOrbitLogger`. The alternative was
duplicating five hundred lines.

**What their payload actually says.** `measured_qty` is the area of one **piece**, and
`package_quantity` is pieces per **box**, so `sqftPerBox` is the product of the two. Their
own data proves it: *AV ROVEN GREY E 4X2 (3)* is a 4ft x 2ft tile and `measured_qty` reads
exactly `8.0000`. `sku` is empty on every row, so `variation_number` becomes ours.
`purchase_price` is the landing cost — **not** `price_with_tax`, which is the selling price
grossed up and would put 18% GST into COGS.

**Warnings, not refusals.** A catalogue that will not load because one tile has a suspect
area is worse than one that loads and says which tile to check. Five conditions raise a
flag and set `sixorbitSyncStatus = NEEDS_ATTENTION`:

| Warning | What it means |
| --- | --- |
| `MISSING_GEOMETRY` | No pieces-per-box or no area — cannot be sold by the square foot |
| `AREA_DISAGREES_WITH_SIZE` | Stated area is more than 2% from the tile's own SIZE |
| `MISSING_PRICE` | No selling price |
| `COST_NOT_BELOW_PRICE` | Landing cost at or above the price |
| `COST_IMPLAUSIBLY_LOW` | Landing cost under 5% of the price — the below-cost guard would misfire |

Two of the first two rows sampled already trip these: *SIM MARMORIES 1600X800* claims 14.2
sq.ft where its size gives 13.78, and carries a landing cost of 16.00 against a price of
1533.90.

**On paging.** Their `variation/fetch` takes `limit` and `limit_bit`, but neither is
documented and the saved request sends both empty. Guessing wrong would not fail loudly —
it would import a subset and look like it worked. So a full load asks for everything in one
call (~18 MB, ~6s, ~7,700 rows) and every run after that uses `last_updated`. If SixOrbit
confirms the semantics this becomes a loop and nothing else changes.

**Rows are skipped, never dropped silently** — a product whose brand or category could not
be resolved, or whose SKU already belongs to a different SixOrbit product, is reported by
name with a reason.

Endpoints: `POST /sixorbit/products/import` (`dryRun` runs inline and writes nothing;
otherwise it queues and refuses a second concurrent run), `GET
/sixorbit/products/import/status`, `DELETE /sixorbit/products/import/status`.

### 12.3 — Product import (pull)

**Depends on G1 and G3.**

- `Product` gains `sixorbitId` (their `isvid`), `syncStatus`, `lastSyncedAt`, `syncError`,
  and `sixorbitRaw` (Json) so fields we don't map yet are not lost.
- Paged import over `variation/fetch`, with `limit` / `limit_bit`.
- **Dry-run first.** A first import of several thousand items into a live catalogue is not
  something to do blind: the preview reports how many would be created, updated, or land
  incomplete, and only then does the real run become available.
- **Incomplete products.** If G3 comes back negative — no pieces-per-box, no sq.ft-per-box
  — imported products cannot be sold as they stand. They import with
  `syncStatus = INCOMPLETE`, are excluded from quotation, order and invoice pickers, and
  appear in a worklist for someone to complete. Better a visible gap than a product that
  prices itself wrongly.
- Delta pull afterwards: a repeatable job calling `variation/fetch&last_updated=<ts>`.
  Interval configurable, default hourly.

**Done when** the SixOrbit catalogue is in TilesERP, every product carries its `isvid`, and
the delta job picks up a change made on their side.

---

### 12.4 — Product push — **done**

The other direction: a product created or edited in TilesERP appears in SixOrbit.

**How it is triggered.** The product handlers publish a `ProductChangedEvent`; the SixOrbit
module subscribes and queues the push. The products module never learns that SixOrbit
exists, so the next integration is wired in without touching it. Publishing happens after
the write, never inside it — a slow third party must not hold a transaction open, and a
product must save whether or not SixOrbit is reachable. Nothing is queued at all when the
integration is switched off.

One job per product is in flight at a time (`jobId: product-push:<id>`), so a product
edited five times while the queue is busy is pushed once, in its final state.

**Editing carries forward, rather than merging wholesale.** We model a dozen of their
ninety fields, and an edit that sent only those would blank the rest. So an edit does start
from the stored `sixorbitRaw` — but takes from it only the keys their *write* form accepts,
listed as `CARRIED_FORWARD` in `sixorbit-push.ts`: vendor mapping, price bands, weight,
rack code.

The restriction matters, and was learned the hard way. The first version spread the raw
payload whole (`{ ...raw, ...ours }`) on the theory that anything not overwritten was
preserved. It preserved nothing. The read and write shapes are named differently — `hsn_code`
against `hsn`, `tax` against `item_tax`, `package_quantity` against `package_qty` — so a
read field was never going to be read back by that endpoint. All the spread did was post
ninety unrecognised keys at a form that accepts thirty-five, and their validator answered
`Please Provide valid item name`. Their own documented edit request is their create request
plus `isvid`; that is now what goes out, and a test asserts an edit sends nothing beyond it.

**The payload is on the log row.** Their rejections name a field and never quote the value,
so a failed write is undiagnosable from the response alone — the query string carries none
of the body. `requestBody` stores the JSON exactly as posted, redacted and capped at 4 KB,
and the sync console shows it pretty-printed beside the response.

**The duplicate guard.** No task in their API accepts an external reference, so a create
that times out after they committed it would duplicate on retry. Every create therefore
searches `variation/fetch&searchtext=<sku>` first and adopts an exact `variation_number`
match instead. A *failed* search is treated as a failure, not as "no duplicate exists" —
that distinction is the whole point.

**Their `isvid` is the anchor, and is written down the moment it is known.** It is their
primary key; `product.sixorbitId` holds it, uniquely, and its presence is the only thing
that decides edit against create — never the name, never the SKU. The import stores it for
every row. An adopt stores it *before* attempting the edit, not after the edit succeeds: a
rejected edit must not discard it, because the search is the only way to recover the link
once a product exists on both sides unlinked, and the day that search misses is the day a
duplicate is created. It is never surfaced in the UI — the products grid shows a sync
status chip and nothing else.

**Blocked, not failed.** Their API can create neither a brand nor a category. A product
under a master they do not have is marked `BLOCKED` with a sentence saying what to do, and
nothing is sent. The queue cannot fix it; a person can. `NO_SELLING_PRICE` and
`NO_GEOMETRY` block on the same principle.

**The one thing to watch.** They store area per *piece* and multiply by `package_qty`; we
store it per *box*. Sending our box figure into their `measurements` field would inflate
every quantity by the number of pieces in a box. `sqftPerPiece` does the conversion and is
pinned by a test.

Endpoints: `POST /sixorbit/products/:id/push`, `POST /sixorbit/products/push-pending`
(both `sixorbit:sync`). The products grid shows each row's state and offers a push.

### 12.5 — Customer sync

**Depends on G2.**

- `Customer` gains `sixorbitId` (`cuid`), `sixorbitAlid`, `syncStatus`, `lastSyncedAt`,
  `syncError`.
- On create, a queued job: search by phone → if found, adopt their `cuid` and details; if
  not, `customer/add_customer`, then adopt what comes back.
- On update, `customer/update_customer`.
- **The name split.** Their customer is person-shaped (`fname`, `lname`, `salutation`,
  `gender`) with `company_name` separate; ours is one `name` plus a `CustomerType`. Rule:
  `RETAIL` splits the name on the first space into first and last; anything else goes to
  `company_name` with the contact person as the name. Their `name` also arrives with the
  balance glued on — `"GALAXY INCORPORATION [Balance: -33,42,31,79,310.50]"` — so
  `display_name` is used and the bracket suffix stripped.
- **Geography.** Their addresses need *their* ids: `current-ctid` (country), `current-stid`
  (state), `current-coverid` (coverage). We store free text. A small resolver caches
  `user/fetch_countries_states` and `user/fetch_cities`, and calls `customer/add_city` for
  a city they don't have — the one master we *can* create on their side.
- **Availability.** Recommended: a customer saves immediately as `PENDING` and syncs on the
  queue, so a SixOrbit outage never stops the counter. The alternative — block the save
  until a `cuid` comes back — guarantees every customer is linked but makes the ERP
  unusable whenever their server is down. **OPEN: confirm which.**

**Done when** saving a customer with an existing SixOrbit phone number adopts that record
rather than creating a duplicate.

---

### 12.6 — Sales order push

**Depends on 12.3, 12.4, 12.5 and G6.**

- `SalesOrder` gains `sixorbitId`, `syncStatus`, `lastSyncedAt`, `syncError`.
- Mapping into `chkorder/create_order_submit`: header (`cuid`, `alid`, `baid`, `said`,
  `chkid`, `ortemid`, dates, payment terms, round-off), `cart[]` per line (`isvid`, `iid`,
  `meaid`, quantity, price, discount), and `pre_charge` / `post_charge` for freight,
  loading and unloading.
- **Preflight.** The job refuses to push an order whose customer or any line's product is
  unmapped, and says which — a half-pushed order is worse than an unpushed one.
- Their side already detects duplicates (`result_code 10001`, "Order Is already created"),
  which is a genuine safety net for retries, though the rule behind it should be confirmed
  rather than trusted blindly.
- Invoice read-back is **OPEN** pending G6. If no task exists, this sprint ends at "the
  order is in SixOrbit" and the invoice number stays on their side.

**Done when** posting a sales order in TilesERP produces the matching order in SixOrbit.

---

### 12.7 — Sync console and hardening

What makes the whole thing operable rather than merely functional.

- **Sync console** (`sixorbit:read`) — the log as an AG Grid: filter by entity, direction,
  success, date; drill into a row for the redacted request and full response; retry one or
  many; a dead-letter view of everything terminal.
- **Backfill tools** — push existing customers and products that predate the integration,
  in controlled batches with a dry-run first.
- **Health** — last successful sync per entity, queue depth and failure count on the
  overview dashboard; a notification when the dead letter grows or auth starts failing.
- Rate-limit backoff once we know their limits; log retention and pruning.
- `docs/SIXORBIT.md` finalised, `docs/ROADMAP.md` phase 12 line updated.

**Done when** a failed sync can be found, understood and retried by someone who did not
write the code.

---

## 5. Sequencing at a glance

| Sprint | Scope | Depends on | Size |
| --- | --- | --- | --- |
| 12.1 | Config, client, auth, sync log, retry queue | — | L |
| 12.2 | Master import (brand, category, attributes) | 12.1 | S |
| 12.3 | Product import (pull) + delta job | 12.2, G1, G3 | L |
| 12.4 | Product push (create/edit) | 12.3, G5 | M |
| 12.5 | Customer lookup-adopt-create | 12.1, G2 | L |
| 12.6 | Sales order push | 12.3–12.5, G6 | L |
| 12.7 | Sync console, backfill, health | all | M |

12.5 depends only on 12.1, so it can run in parallel with 12.2–12.4 if there is a second
pair of hands.

---

## 6. Risks

| Risk | Impact | Response |
| --- | --- | --- |
| Cleartext HTTP with credentials in the URL | Password interceptable | Confirm HTTPS with SixOrbit (G4); never log URLs |
| No idempotency key on any add task | Duplicate customers/products on retry | Search-before-create on every retry path |
| Their variation may lack tile geometry | Imported products unsellable | Dry run, `INCOMPLETE` status, worklist (G3) |
| No master-creation tasks | New local brands can never push | `BLOCKED` status with a clear reason (G5) |
| `result_code` reused across success and failure | Silent misreads | Branch on `success`; codes only classify known failures |
| One outlet, many branches | Branch-wise GST not reproducible on their side | Accepted; branch stays a TilesERP concept |
| Undocumented rate limits | Bulk import throttled or blocked | Concurrency 1 for imports at first, measure, then raise |

---

## 7. Environment

```
SIXORBIT_ENC_KEY=<32-byte base64>    # encrypts the stored password; the only SixOrbit secret in env
```

Everything else — base URL, API key, email, password — lives in `SixOrbitConfig` and is
editable from the settings screen.
