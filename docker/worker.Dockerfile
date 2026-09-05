# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker/package.json ./apps/worker/package.json
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages ./packages
COPY apps/worker ./apps/worker
# Same ordering as api.Dockerfile: generate the Prisma client first, then build the
# workspace packages including sixorbit, which the worker depends on at runtime.
# The old `|| true` on generate hid failures and let a broken image build.
RUN pnpm exec prisma generate --schema=/repo/prisma/schema.prisma \
 && pnpm --filter "@tiles-erp/shared-types" --filter "@tiles-erp/config" \
        --filter "@tiles-erp/validation" --filter "@tiles-erp/shared" \
        --filter "@tiles-erp/sixorbit" build \
 && pnpm --filter "@tiles-erp/worker" build \
 && pnpm --filter "@tiles-erp/worker" --prod deploy /app

# See api.Dockerfile: the generated client does not survive `pnpm deploy`.
RUN cd /app \
 && PRISMA_VERSION="$(node -p "require('@prisma/client/package.json').version")" \
 && npx --yes "prisma@${PRISMA_VERSION}" generate --schema=/repo/prisma/schema.prisma

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 0
CMD ["node", "dist/main.js"]
