# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# One-shot migration/seed runner.
#
# The api and worker runtime images are built with `pnpm --prod deploy`, which
# strips devDependencies — the Prisma CLI and ts-node are therefore NOT present
# there and `prisma migrate deploy` cannot run inside them. This image keeps the
# full workspace install so schema migrations and the seed can run as a separate
# short-lived container before the API starts.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile=false

FROM deps AS runtime
ENV NODE_ENV=production
COPY packages ./packages
COPY prisma ./prisma
COPY docker/migrate-entrypoint.sh /usr/local/bin/migrate-entrypoint.sh

# The seed imports @tiles-erp/config, whose package main points at dist/, so the
# workspace packages it depends on must be built before the seed can resolve it.
RUN pnpm --filter "@tiles-erp/shared-types" --filter "@tiles-erp/config" build \
 && pnpm --filter "@tiles-erp/api" prisma:generate \
 && chmod +x /usr/local/bin/migrate-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/migrate-entrypoint.sh"]
