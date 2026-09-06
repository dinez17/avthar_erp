#!/usr/bin/env bash
# ==========================================================================
# Tiles ERP — PostgreSQL backup.
#
#     ./scripts/backup-db.sh              # write a dump into ./backups
#     ./scripts/backup-db.sh --restore FILE
#
# Install as a nightly cron job (see docs/DEPLOYMENT.md):
#     0 2 * * * cd /opt/tiles-erp && ./scripts/backup-db.sh >> /var/log/tiles-backup.log 2>&1
# ==========================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE=".env.production"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker/docker-compose.prod.yml)
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

# Read the env file as DATA, never as a script (see scripts/load-env.sh).
# shellcheck source=scripts/load-env.sh
. "$REPO_ROOT/scripts/load-env.sh"
load_env_file "$ENV_FILE"

log() { printf '[backup] %s\n' "$*"; }

# docker/backups is bind-mounted into the postgres container at /backups.
mkdir -p docker/backups

if [[ "${1:-}" == "--restore" ]]; then
  FILE="${2:?usage: backup-db.sh --restore <file.dump>}"
  [[ -f "$FILE" ]] || { echo "no such file: $FILE" >&2; exit 1; }

  read -rp "This OVERWRITES the $POSTGRES_DB database. Type the database name to confirm: " confirm
  [[ "$confirm" == "$POSTGRES_DB" ]] || { echo "aborted"; exit 1; }

  log "stopping api and worker so nothing writes during the restore"
  "${COMPOSE[@]}" stop api worker

  log "restoring $FILE"
  "${COMPOSE[@]}" exec -T postgres \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$FILE"

  log "restarting api and worker"
  "${COMPOSE[@]}" start api worker
  log "restore complete"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="docker/backups/tileserp-${STAMP}.dump"

log "dumping $POSTGRES_DB"
# -Fc (custom format) is compressed and lets pg_restore do selective restores.
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
log "wrote $OUT ($SIZE)"

# A zero-byte dump means pg_dump failed while the redirect still created the file.
[[ -s "$OUT" ]] || { echo "[backup] dump is empty — FAILED" >&2; rm -f "$OUT"; exit 1; }

log "pruning dumps older than ${RETENTION_DAYS} days"
find docker/backups -name 'tileserp-*.dump' -mtime "+${RETENTION_DAYS}" -delete

log "uploads volume is NOT included here — see docs/DEPLOYMENT.md for the volume backup"
