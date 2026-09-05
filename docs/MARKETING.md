# Marketing campaigns

Marketing tracks the campaigns that bring leads in and reports what each one returned. It
sits on the CRM leads module (`docs/CRM_LEADS.md`): a lead can be attributed to a campaign,
and the campaign's budget is set against the leads it drew and how many converted.

## A campaign

A campaign has a code, a name, a **channel** (phone, WhatsApp, SMS, email, social media,
exhibition, print, hoarding, referral, website, other), a **status** (draft, active, paused,
completed, cancelled), a **budget**, optional start/end dates, and an objective. Budget is
the one figure the report divides — everything else on the report is counted from the leads.

## Attribution

Each lead carries an optional `campaignId`. It is chosen on the lead form (or left as "No
campaign"), and it is a plain nullable link: leads without a campaign are unaffected, and
**deleting a campaign nulls the link rather than the lead** — the lead keeps its history and
simply loses its attribution. Leads can be filtered by campaign, and the leads grid shows
the campaign each came from.

## One number for value

The report measures money with the lead's own **expected value** — the same figure the
pipeline board weights on. This is deliberate: marketing's "value" and the sales pipeline
read one number rather than two that drift apart. It is an estimate, not booked revenue.

## The performance report

`GET /campaigns/performance` returns one row per campaign:

| Column | How it's computed |
| --- | --- |
| Leads | Count of attributed leads |
| Converted | Leads that reached the CONVERTED stage |
| Conv % | Converted ÷ Leads |
| Cost/lead | Budget ÷ Leads (— when no leads yet) |
| Cost/conversion | Budget ÷ Converted (— when nothing converted) |
| Pipeline value | Expected value of every attributed lead |
| Won value | Expected value of the converted leads |
| ROI | (Won value − Budget) ÷ Budget × 100 (— when no budget) |

Every ratio guards its divide-by-zero, so a campaign with no leads or no budget reads as a
dash rather than a crash. The arithmetic lives in a pure function in the application layer
(`toPerformanceRow`) and is unit-tested directly.

## Permissions

| Permission | Grants |
| --- | --- |
| `crmCampaign:read` | List, view, the performance report, and attributing a lead |
| `crmCampaign:create` / `:update` / `:delete` | Manage the campaign master |

`SUPER_ADMIN` / `ADMIN` hold all. `MANAGER` manages campaigns end to end. `STAFF` may read
campaigns (so a new lead can be attributed) but does not manage them.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/campaigns` | List campaigns; filter by status or channel |
| `GET` | `/campaigns/performance` | The spend-to-return report |
| `GET` | `/campaigns/next-code` | Suggest the next code (CAMP-000042) |
| `GET` | `/campaigns/:id` | One campaign |
| `POST` | `/campaigns` | Create |
| `PATCH` | `/campaigns/:id` | Update (optimistic concurrency via version) |
| `DELETE` | `/campaigns/:id` | Soft-delete (nulls attribution on its leads) |
