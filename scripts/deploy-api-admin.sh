#!/usr/bin/env bash
# Safely deploy API/admin changes without exposing new API code to an old schema.
# Use this instead of `docker compose up --no-deps api admin-pwa`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE=".env.production"
COMPOSE_FILE="docker/docker-compose.prod.yml"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE not found" >&2; exit 1; }

echo '[deploy-api-admin] building migration, API, and admin images'
"${COMPOSE[@]}" build migrate api admin-pwa

echo '[deploy-api-admin] ensuring database and cache are healthy'
"${COMPOSE[@]}" up -d postgres redis

echo '[deploy-api-admin] applying migrations before replacing the API'
"${COMPOSE[@]}" up --exit-code-from migrate migrate

echo '[deploy-api-admin] replacing API and admin services'
"${COMPOSE[@]}" up -d --no-deps api admin-pwa

echo '[deploy-api-admin] waiting for API health'
for attempt in $(seq 1 40); do
  status="$("${COMPOSE[@]}" ps --format json api | sed -n 's/.*"Health":"\([^"]*\)".*/\1/p' | head -1)"
  if [[ "$status" == 'healthy' ]]; then
    echo '[deploy-api-admin] API healthy'
    exit 0
  fi
  sleep 3
done

echo '[deploy-api-admin] API did not become healthy' >&2
"${COMPOSE[@]}" logs --tail=100 api >&2
exit 1
