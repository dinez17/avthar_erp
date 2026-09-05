# Architecture

Tiles ERP is a pnpm + Turborepo monorepo split into deployable applications (`apps/*`)
and shared libraries (`packages/*`).

## Backend (NestJS) — Clean Architecture + DDD + CQRS

Each feature module under `apps/api/src/modules/<module>` is organised into four layers:

- **Presentation** — controllers and DTOs. No business logic. Delegates to the CQRS buses.
- **Application** — command/query objects and their handlers (use cases).
- **Domain** — entities, value objects and repository *ports* (interfaces + injection tokens).
- **Infrastructure** — repository implementations (Prisma), external services, adapters.

Cross-cutting concerns live in `apps/api/src/core` (the "common" layer): configuration,
logging, Prisma, Redis, the BullMQ queue façade, email, notifications, uploads, and the
global HTTP pipeline (validation pipe, exception filter, response + logging interceptors).

The authentication module (`modules/auth`) is the reference implementation of the pattern
and provides JWT access/refresh issuance with refresh-token rotation plus five guards:
authentication, permission (RBAC), role, branch scope, and department scope.

## Worker (NestJS + BullMQ)

`apps/worker` is a headless Nest application context that hosts queue processors for
`email`, `notification`, and `audit`. SMTP delivery lives exclusively in the worker; the
API only enqueues jobs, keeping request handling non-blocking.

## Frontend (React + Vite PWA)

`apps/admin-pwa`, `apps/supplier-pwa`, and `apps/customer-pwa` share the same shell built
from `@tiles-erp/ui` (MUI theme + components) and `@tiles-erp/hooks`. Each is an installable
PWA (vite-plugin-pwa / Workbox) with a service worker, offline app shell, and API caching.

## Shared packages

| Package | Responsibility |
| --- | --- |
| `@tiles-erp/shared-types` | Framework-agnostic TypeScript types and cross-service contracts |
| `@tiles-erp/config` | Runtime constants: permissions, roles, queue names, cache keys |
| `@tiles-erp/validation` | Zod schemas (auth, pagination, environment) |
| `@tiles-erp/shared` | Runtime utilities: Result, error classes, response builders, date/string helpers |
| `@tiles-erp/hooks` | Reusable React hooks |
| `@tiles-erp/ui` | MUI theme, colour-mode provider, shared components |

## Data

PostgreSQL via Prisma. Every entity uses UUID primary keys, audit columns
(`createdAt/By`, `updatedAt/By`, `deletedAt/By`), soft delete, and an optimistic-concurrency
`version` column.
