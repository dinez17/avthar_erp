#!/bin/sh
# ---------------------------------------------------------------------------
# Applies pending Prisma migrations, then optionally runs the seed.
#
# Both steps are idempotent:
#   - `prisma migrate deploy` applies only migrations not yet in _prisma_migrations.
#   - the seed upserts permissions, roles and the admin user, so re-running is safe.
#
# Set RUN_SEED=false in the environment to skip seeding on subsequent deploys.
# ---------------------------------------------------------------------------
set -eu

cd /repo/apps/api

echo "[migrate] waiting for database..."
# Prisma itself retries the connection, but a clear message beats a stack trace.
i=0
until node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT 1\`.then(() => p.\$disconnect()).then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[migrate] database unreachable after 30 attempts — aborting" >&2
    exit 1
  fi
  sleep 2
done
echo "[migrate] database reachable"

echo "[migrate] applying migrations..."
pnpm exec prisma migrate deploy --schema=/repo/prisma/schema.prisma

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "[migrate] running seed..."
  pnpm exec ts-node --transpile-only /repo/prisma/seed.ts
else
  echo "[migrate] RUN_SEED=false — skipping seed"
fi

echo "[migrate] done"
