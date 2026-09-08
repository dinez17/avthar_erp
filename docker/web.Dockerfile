# syntax=docker/dockerfile:1
# Builds any PWA (admin-pwa | supplier-pwa | customer-pwa) and serves it via nginx.
ARG APP=admin-pwa
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS build
ARG APP
# Vite inlines VITE_* at build time, so these must be present here, not at runtime.
# VITE_API_URL is normally left empty in production: the app then derives
# `${origin}/api`, which is correct behind the gateway on 443 for every domain.
ARG VITE_API_URL=""
ARG VITE_APP_ENV="production"
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}
# The installed app's name, written into the PWA manifest at build time. The app.name
# setting cannot reach it — a manifest is read once, when the app is installed.
ARG VITE_APP_NAME=""
ARG VITE_APP_SHORT_NAME=""
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_APP_SHORT_NAME=${VITE_APP_SHORT_NAME}
# Cap the heap so a small VPS swaps instead of getting the build OOM-killed.
# Node's default on a 4 GB box is ~2 GB, which Vite + AG Grid + MUI can exceed.
ARG NODE_MAX_OLD_SPACE=2048
ENV NODE_OPTIONS=--max-old-space-size=${NODE_MAX_OLD_SPACE}
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages ./packages
COPY apps/${APP}/package.json ./apps/${APP}/package.json
RUN pnpm install --frozen-lockfile=false
COPY packages ./packages
COPY apps/${APP} ./apps/${APP}
# The "..." suffix means "this package AND its workspace dependencies", built in
# topological order. A hand-written list of packages goes stale silently: it
# omitted @tiles-erp/shared, which admin-pwa imports, and the build failed with
# 56 "Cannot find module '@tiles-erp/shared'" errors. Letting pnpm derive the
# set from package.json means adding a workspace dependency to any PWA needs no
# change here.
RUN pnpm --filter "@tiles-erp/${APP}..." build

FROM nginx:1.27-alpine AS runtime
ARG APP
COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/${APP}/dist /usr/share/nginx/html
EXPOSE 80
