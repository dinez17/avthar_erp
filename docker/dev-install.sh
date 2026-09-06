#!/bin/sh
# ---------------------------------------------------------------------------
# One-shot setup for the containerised dev stack.
#
# Runs before api / worker / the PWAs start:
#   1. installs the workspace into the container's node_modules volumes
#   2. generates the Prisma client
#   3. builds the shared packages once, so the apps can resolve their dist/
#      (the `packages` watcher takes over from there)
#
# Idempotent — re-running is cheap once the pnpm store volume is warm.
# ---------------------------------------------------------------------------
set -eu

cd /repo

echo "[dev-install] installing workspace dependencies..."
pnpm install --frozen-lockfile=false

echo "[dev-install] generating Prisma client..."
pnpm --filter "@tiles-erp/api" prisma:generate

echo "[dev-install] building shared packages..."
# Order matters: config depends on shared-types, ui depends on hooks, and
# sixorbit needs the Prisma client generated above.
pnpm --filter "@tiles-erp/shared-types" --filter "@tiles-erp/config" \
     --filter "@tiles-erp/validation" --filter "@tiles-erp/shared" \
     --filter "@tiles-erp/hooks" --filter "@tiles-erp/ui" \
     --filter "@tiles-erp/sixorbit" build

echo "[dev-install] done"
