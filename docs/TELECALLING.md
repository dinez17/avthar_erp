# Telecalling

Telecalling records the calls a salesperson or telecaller makes against a lead, and keeps
the pipeline in step with what happened on the phone. It sits directly on top of the CRM
leads module (`docs/CRM_LEADS.md`): every call belongs to a lead, and logging one can move
that lead's follow-up date and stage.

## A call

Each call carries who made it (with a name snapshot), the direction, how long it ran, when
it happened, an optional callback time, and free-text notes — plus the one thing a
telecaller always picks when they hang up: a **disposition**.

| Disposition | Meaning |
| --- | --- |
| `CONNECTED` | Spoke to the person, no stronger signal |
| `NO_ANSWER` / `BUSY` / `SWITCHED_OFF` | Could not reach them |
| `WRONG_NUMBER` | The number is not the lead |
| `CALLBACK` | They asked to be called back later |
| `INTERESTED` | Positive, worth pursuing |
| `NOT_INTERESTED` | Not going anywhere |

Calls are append-only in spirit: a mislogged call is soft-deleted, never rewritten, and
calls cascade-delete with their lead.

## Logging a call keeps the lead in step

This is the point of the module. When a call is logged, the same transaction that writes it
applies a consequence to the lead — so a promised callback and the follow-up it implies can
never drift apart:

- **`NOT_INTERESTED`** closes the lead: stage → NOT_INTERESTED, with the call note kept as
  the reason.
- **`CALLBACK`** sets the lead's **next follow-up** to the callback time. A callback with no
  time is refused.
- Any worked call on a brand-new lead nudges it from **NEW** into **FOLLOW_UP** — logging a
  call means someone is working it.
- A **settled** lead (already converted or dropped) is left alone: a courtesy call after the
  sale neither reopens nor re-closes it.

Because a callback writes the lead's follow-up date, the leads board's **Follow-up due**
filter and overdue flag light up from telecalling with no extra bookkeeping.

## Permissions

| Permission | Grants |
| --- | --- |
| `crmCall:read` | See the call history |
| `crmCall:create` | Log a call (and trigger the lead side effect) |
| `crmCall:delete` | Remove a mislogged call |

`SUPER_ADMIN` / `ADMIN` hold all three. `MANAGER` gets all three; `STAFF` (salespeople and
telecallers) may log and read, but removing a call is a manager's.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/calls?leadId=…` | Calls for a lead, newest first |
| `GET` | `/calls?callbackDue=true&callerUserId=…` | A caller's due-callback queue |
| `POST` | `/calls` | Log a call against a lead |
| `DELETE` | `/calls/:id` | Soft-delete a call |

The lead side effect is driven by the disposition alone; the client sends only the call.
