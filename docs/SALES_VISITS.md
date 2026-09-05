# Sales visits

Sales visits are the in-person counterpart to telecalling: field visits scheduled and then
reported against a lead. Like a call, reporting a visit keeps the pipeline in step — it can
move the lead's follow-up date and stage.

## A visit has a lifecycle

A visit is **planned** for a date, then **completed** (or **cancelled**, or logged as a
**no-show**). It carries a purpose (introduction, product demo, quotation discussion,
negotiation, site measurement, payment follow-up, relationship, other), the salesperson, a
location, notes, and — once completed — an **outcome**. A planned visit whose time has
passed is flagged **overdue**.

## Reporting a visit keeps the lead in step

The lead reacts to the visit's resulting state, in the same transaction that writes it:

- **Scheduling** a visit sets the lead's **next follow-up** to the visit time — the visit is
  the next action — and nudges a brand-new lead into **Follow-up**.
- **Completing** a visit carries the next-action date agreed on site into the lead's
  follow-up. An outcome of **Not interested** closes the lead (stage → Not interested), with
  the visit note kept as the reason.
- A **cancelled** visit or a **no-show** changes nothing on the lead.
- A **settled** lead (already converted or dropped) is never moved by a visit.

Completing a visit requires an outcome. Because scheduling and completing both write the
lead's follow-up, the leads board's overdue flag and the "Follow-up due" filter reflect
field activity with no extra bookkeeping.

## Two views

- On a lead, the **Visits** dialog schedules visits and shows the history, with one-click
  **Complete** / **Cancel** on a planned visit.
- The **Sales visits** page is a cross-lead queue — filter by status, salesperson, or
  **overdue only** — for planning the week and chasing what has slipped.

## Permissions

| Permission | Grants |
| --- | --- |
| `crmVisit:read` | See visits and the queue |
| `crmVisit:create` | Schedule or log a visit |
| `crmVisit:update` | Complete, cancel or edit a visit |
| `crmVisit:delete` | Soft-delete a visit |

`SUPER_ADMIN` / `ADMIN` hold all. `MANAGER` gets all four; `STAFF` may create, read and
update, but not delete.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/visits?leadId=…` | Visits for a lead |
| `GET` | `/visits?status=PLANNED&overdue=true&salespersonUserId=…` | The planning queue |
| `POST` | `/visits` | Schedule or log a visit |
| `PATCH` | `/visits/:id` | Update — completing it can move the lead |
| `DELETE` | `/visits/:id` | Soft-delete |

The lead side effect is derived from the visit's status and outcome; the client sends only
the visit.
