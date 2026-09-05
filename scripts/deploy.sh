#!/usr/bin/env bash
# ==========================================================================
# Tiles ERP — production deploy.
#
# Run from the repository root ON THE SERVER:
#     ./scripts/deploy.sh            # build, migrate, restart
#     ./scripts/deploy.sh --certs    # issue TLS certificates (first deploy only)
#     ./scripts/deploy.sh --no-build # restart without rebuilding images
#
# Safe to re-run: migrations and the seed are idempotent.
# ==========================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE=".env.production"
COMPOSE_FILE="docker/docker-compose.prod.yml"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

# --- preflight ------------------------------------------------------------
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Copy .env.production.example and fill it in."

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

REQUIRED=(
  ADMIN_DOMAIN SUPPLIER_DOMAIN CUSTOMER_DOMAIN LETSENCRYPT_EMAIL
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB REDIS_PASSWORD
  JWT_ACCESS_SECRET JWT_REFRESH_SECRET
  SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD
  SMTP_HOST SMTP_FROM SIXORBIT_ENC_KEY
)
missing=()
for var in "${REQUIRED[@]}"; do
  [[ -n "${!var:-}" ]] || missing+=("$var")
done
(( ${#missing[@]} == 0 )) || die "missing in $ENV_FILE: ${missing[*]}"

# The env schema rejects shorter secrets; catching it here beats a crash loop.
for var in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  value="${!var}"
  (( ${#value} >= 16 )) || die "$var must be at least 16 characters"
done

perms="$(stat -c '%a' "$ENV_FILE")"
[[ "$perms" == "600" ]] || warn "$ENV_FILE is mode $perms — run: chmod 600 $ENV_FILE"

# --- certificate issuance (first deploy) ----------------------------------
issue_certs() {
  log "issuing Let's Encrypt certificates for $ADMIN_DOMAIN, $SUPPLIER_DOMAIN, $CUSTOMER_DOMAIN"
  # Nothing is bound to :80 yet on a first deploy, so certbot's standalone
  # server can answer the challenge. Renewals later use webroot through the
  # running gateway, which is why the port-80 block serves /.well-known.
  "${COMPOSE[@]}" down gateway 2>/dev/null || true

  docker run --rm \
    -p 80:80 \
    -v tiles-erp-prod_certbot_certs:/etc/letsencrypt \
    -v tiles-erp-prod_certbot_webroot:/var/www/certbot \
    certbot/certbot certonly --standalone \
      --non-interactive --agree-tos \
      -m "$LETSENCRYPT_EMAIL" \
      -d "$ADMIN_DOMAIN" -d "$SUPPLIER_DOMAIN" -d "$CUSTOMER_DOMAIN"

  log "certificates issued into the certbot_certs volume"
}

BUILD=true
for arg in "$@"; do
  case "$arg" in
    --certs)    ISSUE_CERTS=true ;;
    --no-build) BUILD=false ;;
    *) die "unknown flag: $arg" ;;
  esac
done

# Create the named volumes up front so the standalone certbot run can mount them.
"${COMPOSE[@]}" create certbot >/dev/null 2>&1 || true

if [[ "${ISSUE_CERTS:-false}" == "true" ]]; then
  issue_certs
fi

if ! docker run --rm -v tiles-erp-prod_certbot_certs:/certs alpine \
     test -f "/certs/live/$ADMIN_DOMAIN/fullchain.pem" 2>/dev/null; then
  die "no certificate for $ADMIN_DOMAIN yet. Run: ./scripts/deploy.sh --certs"
fi

# --- build ----------------------------------------------------------------
if [[ "$BUILD" == "true" ]]; then
  # Warn early rather than after 15 minutes of building.
  total_mem_mb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 ))
  swap_mb=$(( $(awk '/SwapTotal/ {print $2}' /proc/meminfo) / 1024 ))
  if (( total_mem_mb + swap_mb < 7000 )); then
    warn "only ${total_mem_mb}MB RAM + ${swap_mb}MB swap. The Vite builds may be OOM-killed."
    warn "Add swap: see docs/DEPLOYMENT.md step 2."
  fi

  # Built one service at a time on purpose. Compose builds in parallel by default,
  # which runs three Vite builds concurrently — reliably fatal on a 4 GB machine.
  # Serial is slower but survives; set BUILD_PARALLEL=true on a larger server.
  if [[ "${BUILD_PARALLEL:-false}" == "true" ]]; then
    log "building all images in parallel"
    "${COMPOSE[@]}" build --pull
  else
    for svc in migrate api worker admin-pwa supplier-pwa customer-pwa; do
      log "building $svc"
      "${COMPOSE[@]}" build --pull "$svc"
    done
  fi
fi

# --- migrate + start ------------------------------------------------------
log "starting database and cache"
"${COMPOSE[@]}" up -d postgres redis

log "applying migrations${RUN_SEED:+ (RUN_SEED=$RUN_SEED)}"
"${COMPOSE[@]}" up --exit-code-from migrate migrate

log "starting application services"
"${COMPOSE[@]}" up -d

log "waiting for the API to report healthy"
for i in $(seq 1 30); do
  status="$("${COMPOSE[@]}" ps --format json api | sed -n 's/.*"Health":"\([^"]*\)".*/\1/p' | head -1)"
  if [[ "$status" == "healthy" ]]; then
    log "API healthy"
    break
  fi
  if (( i == 30 )); then
    warn "API not healthy after 5 minutes — check: ${COMPOSE[*]} logs api"
  fi
  sleep 10
done

log "deployed. Admin: https://$ADMIN_DOMAIN"
"${COMPOSE[@]}" ps
