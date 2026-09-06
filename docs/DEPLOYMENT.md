# Production Deployment

Deploys Tiles ERP to a single Ubuntu server using Docker Compose, behind nginx with
Let's Encrypt TLS.

**What runs on the server:** PostgreSQL 16, Redis 7, the NestJS API, the BullMQ worker,
three nginx-served PWA builds (admin / supplier / customer), an nginx gateway that
terminates TLS, and certbot for renewals. Only the gateway is exposed — ports 80 and 443.
Postgres and Redis are reachable only on the internal Docker network.

---

## 1. Prerequisites

| Requirement | Minimum                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| OS          | Ubuntu 22.04 or 24.04 LTS                                                |
| RAM         | 4 GB (8 GB more comfortable — the PWA builds are memory-hungry)           |
| Disk        | 40 GB SSD                                                                |
| CPU         | 2 vCPU                                                                   |
| Network     | Public IPv4, ports 80 and 443 open                                        |

### On a 2 vCPU / 4 GB VPS

The stack **runs** comfortably in 4 GB — at idle it sits around 1.5 GB. The risk is the
**build**: three Vite bundles (AG Grid Enterprise and MUI are large) will exhaust memory
if built at once. Three things handle this, and all are already configured:

- **Swap is mandatory** — step 2 below. Without it the build is OOM-killed with a bare
  `Killed` message and no explanation.
- `deploy.sh` builds images **one at a time**. Compose's default is parallel, which is
  reliably fatal here. On a bigger server, `BUILD_PARALLEL=true ./scripts/deploy.sh`.
- `web.Dockerfile` caps Node's heap at 2 GB so it swaps rather than dies.

Expect the **first build to take 25–40 minutes** on this hardware. Later builds reuse the
Docker layer cache and are far quicker. `WORKER_CONCURRENCY=3` is set for 2 cores.

If builds still fail, the escape hatch is to build the images on a stronger machine and
push them to a registry — but try the above first, it is normally enough.

### DNS

Create three A records pointing at the server's public IP **before** the first deploy —
Let's Encrypt validates over HTTP and will fail if DNS has not propagated.

```
erp.avtharceramics.co.in        A    <your-server-ip>
supplier.avtharceramics.co.in   A    <your-server-ip>
customer.avtharceramics.co.in   A    <your-server-ip>
```

Set TTL low (300s) while you are setting this up. Verify from your laptop:

```bash
dig +short erp.avtharceramics.co.in supplier.avtharceramics.co.in customer.avtharceramics.co.in
```

All three must return the server IP before continuing. Propagation is usually minutes but
can take a few hours — do not start step 5 until this is clean.

---

## 2. Server preparation

SSH in as a sudo-capable user (not root).

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw rsync
```

**Swap — required on your 4 GB VPS.** 4 GB of swap gives the builds 8 GB total to work
with:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Prefer RAM, use swap only under real pressure.
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

Confirm it is active — `free -h` should show 4 GB under `Swap`.

**Docker Engine + Compose plugin:**

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in for the group change to apply, then confirm:

```bash
docker compose version   # expect v2.x
```

**Firewall.** Allow your SSH port **before** enabling ufw, or you lock yourself out of
the server and need the provider's web console to get back in.

This server's SSH listens on **2244**, not 22 — `ufw allow OpenSSH` would open the wrong
port. Confirm the port first if you are ever unsure:

```bash
grep -i '^port' /etc/ssh/sshd_config     # or: ss -tlnp | grep sshd
```

Then:

```bash
ufw allow 2244/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP - ACME challenge and redirect'
ufw allow 443/tcp comment 'HTTPS'
ufw enable
ufw status verbose
```

`ufw enable` warns that it may disrupt existing SSH connections — answer `y`. Your current
session survives; the rule above covers reconnecting.

**Before closing this terminal, open a second one and confirm you can still SSH in.** If
the firewall is wrong, that spare session is what lets you fix it.

Note what is *not* opened: 5432 and 6379 stay closed, and the compose file publishes no
ports for them either.

---

## 3. Get the code onto the server

```bash
sudo mkdir -p /opt/tiles-erp
sudo chown "$USER:$USER" /opt/tiles-erp
```

Use git — it gives you a rollback point, a history, and a one-command update on the
server. (`scripts/upload.ps1` is the fallback if git is unavailable; see the end of this
section.)

### 3a. Create the repository (once, on your PC)

The repository **must be private**. It contains your schema, business logic and pricing
rules.

```powershell
cd "D:\node js project\claude_avthar_billing"
git init
git branch -M main
git add .
```

**Before the first commit, verify no secret was staged.** `.gitignore` covers `.env`
files at every level, but confirm rather than assume — a secret in git history is
painful to remove:

```powershell
git status --short | Select-String "\.env"
```

The only matches allowed are `.env.example` and `.env.production.example`. If you see
`apps/api/.env` or a bare `.env`, stop and fix `.gitignore` first.

```powershell
git commit -m "Initial commit: Tiles ERP"
git remote add origin git@github.com:<your-account>/tiles-erp.git
git push -u origin main
```

### 3b. Give the server read access

The server needs to authenticate to clone a private repository. A **deploy key** is the
right tool: it is read-only and scoped to this one repository, so a compromised server
cannot push to your code.

On the server:

```bash
ssh-keygen -t ed25519 -C "tiles-erp-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy that public key, then in GitHub: **your repo → Settings → Deploy keys → Add deploy
key**. Paste it, name it `production-server`, and leave "Allow write access" **unchecked**.

Verify from the server:

```bash
ssh -T git@github.com     # expect: "Hi <repo>! You've successfully authenticated..."
```

### 3c. Clone

```bash
sudo mkdir -p /opt/tiles-erp
sudo chown "$USER:$USER" /opt/tiles-erp
git clone git@github.com:<your-account>/tiles-erp.git /opt/tiles-erp
cd /opt/tiles-erp
chmod +x scripts/deploy.sh scripts/backup-db.sh docker/migrate-entrypoint.sh
```

### 3d. Updating later

```powershell
# on your PC
git add . ; git commit -m "your change" ; git push
```

```bash
# on the server
cd /opt/tiles-erp && git pull && ./scripts/deploy.sh
```

`.env.production` lives only on the server and is gitignored, so `git pull` never touches
it. To roll back a bad release: `git log --oneline`, then `git checkout <good-commit>`
and re-run `./scripts/deploy.sh`.

### Fallback: no git

`scripts/upload.ps1` zips a clean copy and sends it over `scp`:

```powershell
.\scripts\upload.ps1 -Server root@<your-server-ip>
```

It excludes `node_modules`, build output and every `.env*` file, and refuses to run if a
secret gets staged. On Linux/macOS/Git Bash, `rsync` works too:

```bash
rsync -avz --delete \
  --exclude node_modules --exclude dist --exclude .turbo \
  --exclude coverage --exclude 'dev-dist' --exclude '.env*' \
  "/d/node js project/claude_avthar_billing/" \
  root@<your-server-ip>:/opt/tiles-erp/
```

> **Worth doing:** initialise a git repository and push to a private remote instead.
> `git clone` / `git pull` on the server is faster, gives you a rollback point, and
> removes the risk of rsync deleting something it should not.

---

## 4. Configure secrets

On the server:

```bash
cd /opt/tiles-erp
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate each secret separately — never reuse one value across fields:

```bash
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 32   # REDIS_PASSWORD
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 32   # SIXORBIT_ENC_KEY
openssl rand -base64 24   # SEED_ADMIN_PASSWORD
```

Then edit `.env.production` and fill in:

- `LETSENCRYPT_EMAIL` (the domains are already filled in)
- every generated secret above
- `SEED_ADMIN_EMAIL` — the first admin login
- SMTP settings from your mail provider (SES, SendGrid, Postmark, …). Port 587 with
  `SMTP_SECURE=false` means STARTTLS; port 465 requires `SMTP_SECURE=true`.

`SIXORBIT_ENC_KEY` encrypts the SixOrbit password held in the database. Rotating it later
makes the stored password unreadable — you would re-enter it under Settings → SixOrbit.
The SixOrbit base URL, API key, email and password are *not* environment variables; they
live in `sixorbit_config` and are edited from the UI without a redeploy.

Make the scripts executable:

```bash
chmod +x scripts/deploy.sh scripts/backup-db.sh docker/migrate-entrypoint.sh
```

---

## 5. First deploy

Issue the TLS certificates first. Nothing is bound to port 80 yet, so certbot's
standalone server can answer the ACME challenge:

```bash
cd /opt/tiles-erp
./scripts/deploy.sh --certs
```

If this fails, DNS is almost always the cause — re-check `dig` output and that ufw allows
port 80.

Then deploy:

```bash
./scripts/deploy.sh
```

The script will:

1. Validate that every required variable is present and that the JWT secrets are long
   enough (the env schema rejects anything under 16 characters).
2. Warn if RAM + swap is under 7 GB, then build the images **one at a time**.
   **First build takes 25–40 minutes on a 2 vCPU / 4 GB VPS** — it is not stuck.
3. Start Postgres and Redis and wait for their health checks.
4. Run the `migrate` container: `prisma migrate deploy`, then the seed
   (permissions, system roles, the admin user).
5. Start the API, worker, three PWAs, gateway and certbot.
6. Poll until the API reports healthy.

When it finishes, open `https://erp.avtharceramics.co.in` and log in with `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`.

**Change the admin password immediately after the first login**, then set
`RUN_SEED=false` in `.env.production` so later deploys skip the seed.

---

## 6. Verify

```bash
cd /opt/tiles-erp
COMPOSE="docker compose --env-file .env.production -f docker/docker-compose.prod.yml"

$COMPOSE ps                    # api should read "healthy"
$COMPOSE logs -f api           # no startup errors
curl -sf https://erp.avtharceramics.co.in/api/health | jq
```

Checks worth doing by hand:

- `https://erp.avtharceramics.co.in` loads the admin app and you can log in.
- `https://supplier.avtharceramics.co.in` and `https://customer.avtharceramics.co.in` load their portals.
- `http://erp.avtharceramics.co.in` redirects to HTTPS.
- `https://erp.avtharceramics.co.in/api/docs` returns 404 — Swagger is disabled in production.
- The PWA install prompt appears (needs the valid certificate, which is why HTTPS
  matters here beyond confidentiality).
- From your laptop, `nc -zv erp.avtharceramics.co.in 5432` is refused — the database is not exposed.

---

## 7. Updating

```bash
# from your machine
rsync -avz --delete --exclude node_modules --exclude dist --exclude .turbo \
  --exclude coverage --exclude 'dev-dist' --exclude '.env*' \
  "/d/node js project/claude_avthar_billing/" user@<your-server-ip>:/opt/tiles-erp/

# on the server
cd /opt/tiles-erp && ./scripts/deploy.sh
```

`deploy.sh` is safe to re-run: migrations apply only what is pending, and the seed
upserts. `--no-build` restarts without rebuilding when only configuration changed.

**Always back up before deploying a release that adds migrations** (step 8). Prisma's
`migrate deploy` does not roll back.

---

## 8. Backups

```bash
./scripts/backup-db.sh                              # dump to docker/backups/
./scripts/backup-db.sh --restore docker/backups/tileserp-20260904-020000.dump
```

Nightly cron:

```bash
crontab -e
# 0 2 * * * cd /opt/tiles-erp && ./scripts/backup-db.sh >> /var/log/tiles-backup.log 2>&1
```

The database dump does **not** include uploaded files. Back the uploads volume up too:

```bash
docker run --rm \
  -v tiles-erp-prod_api_uploads:/data:ro \
  -v /opt/tiles-erp/docker/backups:/backup \
  alpine tar czf "/backup/uploads-$(date +%Y%m%d).tar.gz" -C /data .
```

Copy both off the server — a backup that only exists on the machine it protects is not a
backup:

```bash
# from your machine
rsync -avz user@<your-server-ip>:/opt/tiles-erp/docker/backups/ ./server-backups/
```

Restore is destructive and asks you to type the database name to confirm.

---

## 9. Operations

```bash
COMPOSE="docker compose --env-file .env.production -f docker/docker-compose.prod.yml"

$COMPOSE logs -f api worker      # follow logs
$COMPOSE restart api             # restart one service
$COMPOSE ps                      # status and health
$COMPOSE down                    # stop everything (volumes survive)
docker stats --no-stream         # resource usage
```

Logs rotate at 10 MB × 5 files per service, so they cannot fill the disk.

Certificates renew automatically: the certbot container tries twice a day and no-ops
until a certificate is within 30 days of expiry, and the gateway reloads every 12 hours to
pick up renewed files. Check with:

```bash
docker run --rm -v tiles-erp-prod_certbot_certs:/etc/letsencrypt certbot/certbot certificates
```

---

## 10. Troubleshooting

**`migrate` exits non-zero.** Read `$COMPOSE logs migrate`. A failed migration leaves the
database mid-upgrade; restore from backup rather than re-running blindly.

**API restarts in a loop.** Almost always a rejected environment variable —
`$COMPOSE logs api` prints the Zod validation error naming the field. JWT secrets under
16 characters and a missing `SIXORBIT_ENC_KEY` are the common ones.

**Gateway will not start.** Usually a missing certificate. Confirm
`/etc/letsencrypt/live/$ADMIN_DOMAIN/fullchain.pem` exists in the `certbot_certs` volume,
otherwise re-run `./scripts/deploy.sh --certs`.

**Build killed around the PWA step** (a bare `Killed`, or exit code 137). Out of memory.
Check swap is actually on with `free -h` — a `fallocate`'d swapfile does not survive a
reboot unless the `/etc/fstab` line from step 2 was added. Watch a build with
`free -h -s 5` in a second SSH session to confirm. If swap is on and it still dies,
lower the heap cap:

```bash
docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
  build --build-arg NODE_MAX_OLD_SPACE=1536 admin-pwa
```

**Server sluggish while building.** Expected on 2 cores — the build saturates both. Do
this outside business hours once the system is live; a rebuild takes the site down only
briefly at the end, but the machine is slow throughout.

**Browser shows a stale version after deploying.** The service worker cached the old
shell. `sw.js` and `index.html` are served `no-cache`, so a hard reload
(Ctrl+Shift+R) resolves it; the update lands on the next visit otherwise.

**Certificate renewal fails.** Port 80 must stay open and reachable — the webroot
challenge needs `http://$ADMIN_DOMAIN/.well-known/acme-challenge/` to be served by the
gateway. Test with `curl -I http://erp.avtharceramics.co.in/.well-known/acme-challenge/test`
(a 404 from nginx is fine; a timeout is not).

---

## Security notes

Things deliberately different from `docker/docker-compose.yml`, which targets local
development and must not be used on a public server:

- Postgres and Redis publish no ports. The dev file maps 5432 and 6379 to the host,
  which on a public IP exposes the database to the internet.
- Every secret is required, with no `change_me` fallbacks. A missing value fails the
  deploy rather than shipping a known-weak default.
- Swagger is off. `API_CORS_ORIGINS` lists the three real origins — not `lan`, not `*`.
- MailHog is gone; it captures mail rather than sending it.
- Redis requires a password and runs `maxmemory-policy noeviction`, because evicting
  BullMQ keys would silently drop queued jobs.
- HSTS is enabled with a two-year max-age. Browsers cache this, so confirm HTTPS works on
  all three domains before it is served widely — the header lives in
  `docker/nginx/snippets/security-headers.conf` if you need to disable it during testing.

Still on you, outside this stack: SSH key-only authentication with passwords disabled,
`unattended-upgrades` for OS patches, and off-site backup copies.
