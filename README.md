# Tiles ERP

Enterprise-grade **Progressive Web Application** for tile wholesalers and retailers.
This repository contains the **production-ready foundation** — architecture, shared
libraries, authentication infrastructure, background processing, database, PWA shells,
and container/orchestration configuration. Business modules (products, inventory, sales,
purchase, CRM, logistics, portals, SixOrbit) are intentionally **not** included yet; they
plug into this foundation incrementally.

## Tech stack

**Frontend** React · TypeScript · Vite · Material UI · React Router · TanStack Query ·
React Hook Form · Zod · AG Grid · Workbox (PWA)

**Backend** NestJS · TypeScript · Prisma · PostgreSQL · Redis · BullMQ · Swagger
(Clean Architecture · DDD · CQRS)

**Infra** Docker · Docker Compose · Nginx · pnpm · Turborepo

## Monorepo layout

```
tiles-erp/
├── apps/
│   ├── admin-pwa/        # Admin PWA (React + Vite + MUI, installable/offline)
│   ├── supplier-pwa/     # Supplier portal PWA
│   ├── customer-pwa/     # Customer portal PWA
│   ├── api/              # NestJS API (Clean Architecture + DDD + CQRS)
│   └── worker/           # BullMQ worker (email / notification / audit)
├── packages/
│   ├── shared-types/     # Cross-cutting TypeScript types & contracts
│   ├── config/           # Runtime constants: permissions, roles, queues, cache keys
│   ├── validation/       # Zod schemas (auth, pagination, env)
│   ├── shared/           # Runtime utilities (Result, errors, response builders, dates)
│   ├── hooks/            # Reusable React hooks
│   └── ui/               # MUI theme, colour-mode provider, shared components
├── prisma/               # schema.prisma + seed
├── docker/               # Dockerfiles, docker-compose, nginx configs
├── docs/                 # Architecture, getting started, conventions
├── turbo.json            # Turborepo pipeline
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Quick start — everything in Docker (recommended)

Docker is the only prerequisite. No Node, pnpm or Prisma on your machine.

```bash
docker compose -f docker/docker-compose.dev.yml up
```

Admin http://localhost:5173 · Supplier :5174 · Customer :5175 · API :3000/api ·
Swagger :3000/api/docs · MailHog :8025. Login `admin@tileserp.local` / `ChangeMe123`.

First run takes 5–10 minutes; later runs start in seconds. Hot reload works for the API,
the worker, the shared packages and all three PWAs. See **`docs/DOCKER_DEV.md`**.

## Quick start — native toolchain

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
docker compose -f docker/docker-compose.yml up -d postgres redis mailhog
cp apps/api/.env.example apps/api/.env
pnpm prisma:generate && pnpm prisma:migrate && pnpm prisma:seed
pnpm dev
```

See `docs/GETTING_STARTED.md` for the full walkthrough, `docs/ARCHITECTURE.md` for the design,
`docs/DEPLOYMENT.md` to deploy to a Linux server,
`docs/NETWORK_ACCESS.md` to open the app from another laptop or phone on your network, and
`docs/PWA_INSTALL.md` to install it as an app on a phone.

## Common commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Run all apps in watch mode (Turborepo) |
| `pnpm build` | Build every package and app |
| `pnpm lint` | Lint the whole workspace |
| `pnpm typecheck` | Type-check the whole workspace |
| `pnpm test` | Run unit tests |
| `pnpm format` | Prettier write |
| `pnpm prisma:migrate` | Create/apply a dev migration |
| `pnpm prisma:seed` | Seed permissions, roles and the super admin |
| `pnpm docker:up` / `docker:down` | Start / stop the full stack |
| `pnpm dev:docker` | Run **everything** in Docker with hot reload |
| `pnpm dev:docker:down` | Stop the containerised dev stack |
| `pnpm dev:docker:reset` | Stop it and wipe its volumes (fresh database) |

## Authentication foundation

The API ships JWT access/refresh tokens with **refresh-token rotation** (Redis-backed
single-use tokens) and five composable guards — authentication, permission (RBAC), role,
branch scope, and department scope — registered globally. There is no login **screen** yet;
the login/UX module is added later. The `auth` module is the reference implementation of the
Clean Architecture + CQRS pattern for all future modules.

## License

UNLICENSED — private project.
