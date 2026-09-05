# Accessing the app from another laptop or phone

During development the app can be opened from any device on the same Wi-Fi/LAN.

## 1. Find your machine's LAN IP

Windows:

```
ipconfig
```

Look for **IPv4 Address** under your active adapter, e.g. `192.168.1.12`.

## 2. Configure environment (once)

`apps/api/.env`:

```
API_CORS_ORIGINS=lan
```

`lan` allows `localhost` plus private-network origins (`192.168.x.x`, `10.x.x.x`,
`172.16-31.x.x`). Use explicit origins or `*` for production.

Each PWA's `.env` (e.g. `apps/admin-pwa/.env`):

```
VITE_API_URL=
VITE_API_PORT=3000
```

Leaving `VITE_API_URL` blank makes the frontend derive the API address from whatever
host you opened it on, so a phone at `http://192.168.1.12:5173` calls
`http://192.168.1.12:3000/api` instead of its own localhost.

## 3. Allow the ports through Windows Firewall (once)

Run PowerShell **as Administrator**:

```
New-NetFirewallRule -DisplayName "Tiles ERP dev" -Direction Inbound -Protocol TCP -LocalPort 3000,5173,5174,5175 -Action Allow -Profile Private
```

Only the **Private** profile is opened, so this does not expose the app on public
networks.

## 4. Start the stack

```
pnpm --filter @tiles-erp/api --filter @tiles-erp/worker --filter @tiles-erp/admin-pwa dev
```

Vite prints a **Network:** URL — open that on the other device:

- Admin PWA:    `http://<your-ip>:5173`
- Supplier PWA: `http://<your-ip>:5174`
- Customer PWA: `http://<your-ip>:5175`
- API / Swagger: `http://<your-ip>:3000/api/docs`

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Page does not load at all | Firewall rule missing, or devices on different networks (e.g. phone on mobile data, or Wi-Fi client isolation enabled on the router) |
| Page loads but login fails / network errors | `API_CORS_ORIGINS` not set to `lan`, or `VITE_API_URL` still pinned to `localhost` |
| Stale layout on the other device | Service worker cache — hard refresh (`Ctrl+Shift+R`), or on mobile clear the site data |
| Works on laptop, not phone | Corporate/guest Wi-Fi often blocks device-to-device traffic; try a phone hotspot with the laptop joined to it |

## Installing as a phone app

Opening the app over `http://<ip>:5173` works, but it cannot be **installed** as a PWA —
browsers require a secure origin for that. See `docs/PWA_INSTALL.md`.

## Production

For real deployments run the Docker stack and put everything behind the Nginx
gateway on port 80 (see `docker/docker-compose.yml`); the API is then same-origin at
`/api` and no CORS configuration is needed.
