#!/bin/sh
# ---------------------------------------------------------------------------
# Waits until every shared package has a built dist/, then execs the command
# passed as arguments.
#
# Why this is needed: the `packages` service runs `tsup --watch`, which cleans
# dist/ and rebuilds it on startup. An app that begins its dependency scan
# during that window dies with:
#
#   Failed to load url /@fs/repo/packages/hooks/dist/index.js
#   Failed to resolve entry for package "@tiles-erp/ui"
#
# The `install` service builds these once up front, but the watcher's clean
# removes them again moments later, so "install finished" is not enough of a
# guarantee on its own.
#
# Usage:  wait-for-packages.sh <command> [args...]
# ---------------------------------------------------------------------------
set -eu

PACKAGES="shared-types config validation shared hooks ui sixorbit"
MAX_ATTEMPTS=300 # 300 x 2s = 10 minutes

echo "[wait-for-packages] waiting for packages/*/dist ..."

attempt=0
while :; do
    missing=""
    for pkg in $PACKAGES; do
        if [ ! -f "/repo/packages/$pkg/dist/index.js" ]; then
            missing="$missing $pkg"
        fi
    done

    [ -z "$missing" ] && break

    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
        echo "[wait-for-packages] timed out waiting for:$missing" >&2
        echo "[wait-for-packages] check the 'packages' service logs" >&2
        exit 1
    fi

    # Report every ~30s rather than every tick.
    if [ $((attempt % 15)) -eq 1 ]; then
        echo "[wait-for-packages] still waiting for:$missing"
    fi

    sleep 2
done

# A rebuild writes index.js before the rest of the bundle is flushed; a moment's
# grace avoids reading a half-written file.
sleep 2

echo "[wait-for-packages] all packages built — starting: $*"
exec "$@"
