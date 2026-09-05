# Getting started

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker (for PostgreSQL, Redis, and full-stack runs)

## 1. Install

```bash
pnpm install
```

## 2. Environment

Copy the example env files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/admin-pwa/.env.example apps/admin-pwa/.env
cp apps/supplier-pwa/.env.example apps/supplier-pwa/.env
cp apps/customer-pwa/.env.example apps/customer-pwa/.env
```

## 3. Infrastructure (Postgres + Redis + MailHog)

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis mailhog
```

## 4. Database

```bash
pnpm prisma:generate
pnpm prisma:migrate      # creates the initial migration
pnpm prisma:seed         # seeds permissions, roles and a super admin
```

Default super admin: `admin@tileserp.local` / `ChangeMe123` (override with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

## 5. Run in development

```bash
pnpm dev            # runs everything via Turborepo
# or individually:
pnpm --filter @tiles-erp/api dev
pnpm --filter @tiles-erp/worker dev
pnpm --filter @tiles-erp/admin-pwa dev
```

- API:        http://localhost:3000/api
- Swagger:    http://localhost:3000/api/docs
- Admin PWA:  http://localhost:5173
- MailHog UI: http://localhost:8025

## 6. Full stack in Docker

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Gateway on http://localhost (admin), http://supplier.localhost, http://customer.localhost.
