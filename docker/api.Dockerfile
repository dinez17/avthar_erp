# syntax=docker/dockerfile:1
# Multi-stage build for the NestJS API within the pnpm monorepo.
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
# Order matters: @tiles-erp/sixorbit imports @prisma/client types, so the client
# must be generated before the workspace packages are built. sixorbit is a runtime
# dependency of the API and resolves through its dist/, so it must be built here —
# omitting it leaves the deployed bundle importing a package with no dist.
RUN pnpm --filter "@tiles-erp/api" prisma:generate \
 && pnpm --filter "@tiles-erp/shared-types" --filter "@tiles-erp/config" \
        --filter "@tiles-erp/validation" --filter "@tiles-erp/shared" \
        --filter "@tiles-erp/sixorbit" build \
 && pnpm --filter "@tiles-erp/api" build \
 && pnpm --filter "@tiles-erp/api" --prod deploy /app

# `pnpm deploy` rebuilds node_modules from the store, which does not carry the
# generated Prisma client (generate writes into node_modules in place). Re-generate
# against the deployed tree, pinned to the client version actually installed there,
# or the API throws "@prisma/client did not initialize yet" on first query.
RUN cd /app \
 && PRISMA_VERSION="$(node -p "require('@prisma/client/package.json').version")" \
 && npx --yes "prisma@${PRISMA_VERSION}" generate --schema=/repo/prisma/schema.prisma

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
COPY --from=build /repo/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
