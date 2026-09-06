#!/usr/bin/env bash
# ==========================================================================
# Generates .env.production from .env.production.example with strong,
# correctly-formatted secrets already filled in.
#
#     ./scripts/init-env.sh
#
# Leaves LETSENCRYPT_EMAIL and the SMTP_* values blank — those are yours to
# fill in with `nano .env.production` afterwards.
#
# Refuses to run if .env.production already exists, so it can never silently
# rotate live secrets. Rotating JWT secrets logs every user out; rotating
# SIXORBIT_ENC_KEY makes the stored SixOrbit password unreadable.
# ==========================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET=".env.production"
SOURCE=".env.production.example"

if [[ -f "$TARGET" ]]; then
  echo "$TARGET already exists — refusing to overwrite." >&2
  echo "Delete it first if you really want fresh secrets (this invalidates" >&2
  echo "all sessions and makes any stored SixOrbit password unreadable)." >&2
  exit 1
fi

[[ -f "$SOURCE" ]] || { echo "$SOURCE not found — are you in the repo root?" >&2; exit 1; }

cp "$SOURCE" "$TARGET"
chmod 600 "$TARGET"

# Sets KEY=<value> in the target file. base64 output uses only [A-Za-z0-9+/=],
# so '|' is a safe sed delimiter and there is no '&' to escape in replacements.
set_var() {
  local key="$1" value="$2"
  sed -i "s|^${key}=.*|${key}=${value}|" "$TARGET"
}

echo "Generating secrets..."

set_var POSTGRES_PASSWORD "$(openssl rand -base64 32)"
set_var REDIS_PASSWORD    "$(openssl rand -base64 32)"
set_var JWT_ACCESS_SECRET "$(openssl rand -base64 48)"
set_var JWT_REFRESH_SECRET "$(openssl rand -base64 48)"

# Must decode to EXACTLY 32 bytes — the API validates the decoded length.
set_var SIXORBIT_ENC_KEY "$(openssl rand -base64 32)"

# Alphanumeric only: this one gets typed into a login form by hand, and
# base64's +/= characters are a nuisance there.
ADMIN_PASSWORD="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 20)"
set_var SEED_ADMIN_PASSWORD "$ADMIN_PASSWORD"

# --- verify ---------------------------------------------------------------
# Catch a bad substitution now rather than at first boot.
enc_key="$(grep '^SIXORBIT_ENC_KEY=' "$TARGET" | cut -d= -f2-)"
decoded_len="$(printf '%s' "$enc_key" | base64 -d 2>/dev/null | wc -c)"
if [[ "$decoded_len" -ne 32 ]]; then
  echo "SIXORBIT_ENC_KEY decodes to ${decoded_len} bytes, expected 32 — aborting." >&2
  rm -f "$TARGET"
  exit 1
fi

for var in POSTGRES_PASSWORD REDIS_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  value="$(grep "^${var}=" "$TARGET" | cut -d= -f2-)"
  [[ -n "$value" ]] || { echo "$var is empty — aborting." >&2; rm -f "$TARGET"; exit 1; }
done

echo
echo "Created $TARGET (mode 600) with generated secrets."
echo
echo "  Admin login: $(grep '^SEED_ADMIN_EMAIL=' "$TARGET" | cut -d= -f2-)"
echo "  Password:    $ADMIN_PASSWORD"
echo
echo "Write that password down now — change it after your first login."
echo
echo "Still to fill in by hand:  nano $TARGET"
echo "  LETSENCRYPT_EMAIL   an address you actually read"
echo "  SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD"
