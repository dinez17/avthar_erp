# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Shared development image for every Node service (api, worker, PWAs, package
# watcher).
#
# Deliberately copies no source: the repository is bind-mounted at run time so
# edits on the host are seen instantly by the watchers inside the container.
# Dependencies live in named volumes (see docker-compose.dev.yml) because
# node_modules built on Windows cannot be used by Linux — esbuild, Prisma and
# other native binaries are platform-specific.
# ---------------------------------------------------------------------------
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Only two packages are needed:
#   openssl      — Prisma's query engine links against it
#   libc6-compat — glibc shim for the prebuilt esbuild / Prisma binaries on musl
#
# git is deliberately NOT installed: no dependency in pnpm-lock.yaml resolves from a
# git URL, and the one `prepare` script (husky) is guarded with `|| true`. Installing
# it pulled in ten extra packages (curl, pcre2, expat, …) — ten more chances for a
# flaky connection to fail the build.
#
# The retry loop matters on a slow or unreliable link: apk aborts the whole layer if
# a single package download times out, and the default is to give up immediately.
RUN for attempt in 1 2 3 4 5; do \
      echo "apk attempt $attempt..." && \
      apk add --no-cache openssl libc6-compat && break || \
      { echo "apk failed, retrying in 5s"; rm -rf /var/cache/apk/*; sleep 5; }; \
    done && \
    apk info -e openssl >/dev/null || { echo "openssl missing after retries" >&2; exit 1; }

# husky is a dev-only git-hook installer; without git it would print noise on install.
ENV HUSKY=0

WORKDIR /repo

# Keep the pnpm store in a volume so re-installs are fast across rebuilds.
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV npm_config_store_dir=/pnpm/store

# Bind mounts do not deliver inotify events reliably from a Windows or macOS
# host, so every watcher in this image polls instead. Without this, saving a
# file on the host changes nothing inside the container and hot reload appears
# broken. chokidar (Vite, tsup) reads the first two; TypeScript's watcher, which
# `nest start --watch` uses, reads the TSC_* pair.
ENV CHOKIDAR_USEPOLLING=true
ENV CHOKIDAR_INTERVAL=300
ENV TSC_WATCHFILE=PriorityPollingInterval
ENV TSC_WATCHDIRECTORY=DynamicPriorityPolling

CMD ["sh", "-c", "echo 'This image expects a command from docker-compose.dev.yml' && sleep infinity"]
