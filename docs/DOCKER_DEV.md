# Development in Docker

Runs the **entire** stack in containers — Postgres, Redis, MailHog, the API, the worker,
the shared-package watcher and all three PWAs. Docker is the only thing you need
installed. No Node, no pnpm, no Prisma CLI on your machine.

This mirrors production, where every service is also containerised, so "works on my
machine" and "works on the server" stop drifting apart.

> The older mixed workflow — infrastructure in Docker, apps via `pnpm dev` — still works
> and is documented in `docs/GETTING_STARTED.md`. Use whichever you prefer; they share the
> same database port, so run one at a time.

---

## Start

```bash
docker compose -f docker/docker-compose.dev.yml up
```

First run takes 5–10 minutes: it builds the dev image, installs the workspace and builds
the shared packages. Later runs start in seconds because both the pnpm store and the
installed `node_modules` live in Docker volumes.

Leave it running in the foreground to watch the logs; `Ctrl+C` stops everything.

| URL                     | What                                     |
| ----------------------- | ---------------------------------------- |
| http://localhost:5173   | Admin PWA                                |
| http://localhost:5174   | Supplier portal                          |
| http://localhost:5175   | Customer portal                          |
| http://localhost:3000/api | API                                    |
| http://localhost:3000/api/docs | Swagger                           |
| http://localhost:8025   | MailHog — every email the app sends      |
| localhost:5432          | Postgres, for pgAdmin / DBeaver          |

Default login: `admin@tileserp.local` / `ChangeMe123`.

---

## What starts, in what order

```
postgres ─┐
redis ────┼─► install ──► migrate ──► api ──► (ready)
mailhog ──┘       │           │       worker
                  │           │
                  ├──► packages (watches packages/*)
                  └──► admin-pwa, supplier-pwa, customer-pwa
```

- **install** — one-shot: `pnpm install`, `prisma generate`, builds the shared packages.
  Exits 0, then everything else starts. Re-running is cheap.
- **migrate** — one-shot: `prisma migrate deploy` then the seed.
- **packages** — `tsup --watch` over `packages/*`, so editing shared code rebuilds it and
  the apps pick it up.
- **api** / **worker** — `nest start --watch`.
- **\*-pwa** — Vite dev servers with HMR.

---

## Everyday commands

```bash
# start / stop
docker compose -f docker/docker-compose.dev.yml up
docker compose -f docker/docker-compose.dev.yml down

# rebuild after editing dev.Dockerfile
docker compose -f docker/docker-compose.dev.yml up --build

# logs for one service
docker compose -f docker/docker-compose.dev.yml logs -f api

# a shell inside a container
docker compose -f docker/docker-compose.dev.yml exec api sh

# restart just one service
docker compose -f docker/docker-compose.dev.yml restart api
```

If you have Node locally, `npm run dev:docker`, `dev:docker:down`, `dev:docker:logs` and
`dev:docker:shell` are shortcuts for the same things.

### Running one-off commands

Anything you would have run with `pnpm` runs inside a container instead:

```bash
DC="docker compose -f docker/docker-compose.dev.yml"

$DC exec api pnpm exec prisma studio --schema=/repo/prisma/schema.prisma
$DC exec api pnpm test
$DC exec api pnpm typecheck
$DC run --rm install            # re-install after changing package.json
```

### Creating a migration

`prisma migrate dev` is interactive, so run it attached:

```bash
docker compose -f docker/docker-compose.dev.yml exec api \
  pnpm exec prisma migrate dev --schema=/repo/prisma/schema.prisma --name your_migration_name
```

The new migration file appears in `prisma/migrations/` on your machine, because the repo
is bind-mounted.

---

## How the source is wired

The repository is bind-mounted at `/repo`, so a file you save in VS Code on Windows is
seen immediately by the watchers in the containers.

Every `node_modules` directory is a **named volume layered on top of that bind mount** —
one for the root, one per app, one per package. This is the part that matters:
dependencies installed on Windows contain Windows binaries (esbuild, the Prisma query
engine, SWC) that cannot execute on Linux. Keeping the two sets separate means the
container never sees your Windows `node_modules`, and your local `pnpm dev` still works
untouched if you want to switch back.

The consequence: **installing a package on the host does not install it in the
container.** After changing any `package.json`, run:

```bash
docker compose -f docker/docker-compose.dev.yml run --rm install
```

### File watching

Bind mounts do not deliver filesystem events reliably from Windows or macOS, so the dev
image sets every watcher to poll (`CHOKIDAR_USEPOLLING` for Vite and tsup,
`TSC_WATCHFILE` / `TSC_WATCHDIRECTORY` for the NestJS watcher). Without this, saving a
file changes nothing inside the container and hot reload looks broken.

Polling costs some CPU. If your machine struggles, raise `CHOKIDAR_INTERVAL` in
`docker/dev.Dockerfile` from `300` to `1000` and rebuild.

---

## Resetting

```bash
# drop the database and start clean (also wipes node_modules volumes)
docker compose -f docker/docker-compose.dev.yml down -v
docker compose -f docker/docker-compose.dev.yml up
```

To reset **only** the database, keeping the dependency volumes so the next start is fast:

```bash
DC="docker compose -f docker/docker-compose.dev.yml"
$DC down
docker volume rm tiles-erp-dev_postgres_data
$DC up
```

---

## Troubleshooting

**Port already in use.** Something else holds 5432, 6379, 3000 or 5173–5175 — often the
old mixed workflow, or a local Postgres install. Stop it, or change the left-hand side of
the port mapping in `docker-compose.dev.yml`.

**Changes are not picked up.** Check the `packages` service is running
(`$DC ps`) — a change in `packages/*` only reaches the apps after tsup rebuilds it. If
nothing at all reloads, polling is not working; confirm the container has
`CHOKIDAR_USEPOLLING=true` with `$DC exec api env | grep POLL`.

**`Cannot find module '@tiles-erp/...'`.** The shared packages have not been built.
Re-run `$DC run --rm install`.

**`install` fails on a native dependency.** Delete the dependency volumes and retry:
`$DC down -v && $DC up --build`.

**The API restarts in a loop.** `$DC logs api` prints the Zod env validation error naming
the offending variable.

**Slow on Windows.** The repo living on `D:` and crossing into a Linux VM has real
overhead. Docker Desktop's WSL 2 backend is much faster than Hyper-V; if it is already on,
moving the repository inside the WSL filesystem is the next big win.

**Build fails at `apk add` with `DNS: name does not exist`.** Docker's build container
cannot resolve DNS. It is a network problem, not a Dockerfile problem — the same package
names work once DNS does. Fix it in Docker Desktop:

**Settings → Docker Engine**, add a `dns` key to the JSON, then **Apply & restart**:

```json
{
  "builder": { "gc": { "defaultKeepStorage": "20GB", "enabled": true } },
  "experimental": false,
  "dns": ["8.8.8.8", "1.1.1.1"]
}
```

Keep whatever keys are already there and add only the `dns` line. Then retry the build.

If you are on a VPN or a corporate network, disconnect and retry — split-tunnel VPNs
routinely break Docker's embedded DNS resolver.

**Build fails with `I/O error` while extracting a package.** Usually the same flaky
connection truncating a download, but it can also mean Docker Desktop's disk image is
full. Check **Settings → Resources → Advanced** for available disk, and reclaim space
with `docker system prune -a` if it is tight.
