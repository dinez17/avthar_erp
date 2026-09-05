# Installing the app on a phone or tablet

The admin, supplier and customer apps are Progressive Web Apps: once installed they
open in their own window, with no browser address bar, and work offline for cached
screens.

## Why "Add to home screen" opened Chrome instead

Browsers only install a **real** PWA from a **secure origin**:

| Address | Installable? |
| --- | --- |
| `http://localhost:5173` | Yes — localhost is treated as secure |
| `http://192.168.1.109:5173` | **No** — plain HTTP on a LAN address |
| `https://192.168.1.109:5173` | Yes |
| `https://erp.yourdomain.com` | Yes (production) |

On a non-secure origin, Chrome's menu still offers "Add to Home screen", but it only
creates a **bookmark shortcut** that opens in the browser. The service worker is never
registered, so there is no offline support either. This is a browser security rule, not
a setting in the app.

## Option 1 — HTTPS dev server (quickest for testing)

```bash
pnpm --filter @tiles-erp/admin-pwa dev:https
```

Vite serves over HTTPS with a self-signed certificate and prints an
`https://192.168.x.x:5173` address.

On the phone:

1. Open that HTTPS address.
2. Chrome warns "Your connection is not private" — tap **Advanced → Proceed**. This is
   expected: the certificate is self-signed, not issued by a public authority.
3. Menu (⋮) → **Install app** / **Add to Home screen**. If the menu says *Install app*,
   it is a real PWA install.

**The API must use HTTPS too.** A page served over HTTPS cannot call an `http://`
endpoint — browsers block that as mixed content, which shows up as
*"Cannot reach the server at https://…:3000/api"*. Start the API in HTTPS mode:

```bash
pnpm --filter @tiles-erp/api dev:https
```

On first start it generates a self-signed certificate into `apps/api/certs/` covering
`localhost` and your machine's LAN addresses. Then **visit the API URL once on the
phone** (e.g. `https://192.168.1.109:3000/api/docs`) and accept the warning — the
browser will not trust the certificate for background requests until you do.

So the full HTTPS pair is:

```bash
pnpm --filter @tiles-erp/api dev:https
pnpm --filter @tiles-erp/admin-pwa dev:https
```

> Self-signed certificates are fine for testing on your own devices. Some Android
> versions refuse to register a service worker behind an untrusted certificate — if
> **Install app** does not appear, use Option 2 or 3.

## Option 2 — Trusted certificate on the LAN (recommended for real use)

Use [mkcert](https://github.com/FiloSottile/mkcert) to issue a certificate your devices
actually trust:

```powershell
choco install mkcert          # or: scoop install mkcert
mkcert -install
mkcert 192.168.1.109 localhost
```

Copy the generated `.pem` files into `certs/` and point the dev server or Nginx at them.
Install the mkcert root CA on the phone as well (`mkcert -CAROOT` shows where it lives;
transfer `rootCA.pem` to the device and install it under *Settings → Security →
Encryption & credentials → Install a certificate → CA certificate*). No warnings, and
installation works fully.

## Option 3 — Public HTTPS tunnel (most reliable for phones)

Android often refuses to register a service worker behind a self-signed certificate, so
"Install app" never appears. A tunnel gives you a **real, publicly trusted** HTTPS
certificate, and the install then behaves exactly as it will in production.

Run the full stack behind the Nginx gateway so the app and API share one origin:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

That serves the admin app on `http://localhost` with the API at `http://localhost/api`.
Then expose port 80 with any tunnel, e.g. Cloudflare's free quick tunnel:

```bash
cloudflared tunnel --url http://localhost:80
```

It prints an address like `https://random-words.trycloudflare.com`. Open that on the
phone — no warnings, no certificates to install — and the menu will offer **Install
app**.

Because the gateway serves the API under `/api` on the same origin, the frontend
resolves the API automatically: no `VITE_API_URL`, no CORS configuration, no mixed
content. This is the same shape as production.

> Quick tunnels are throwaway URLs for testing. For permanent access use a named
> Cloudflare tunnel or your own domain with a certificate.

## Option 4 — Chrome USB port forwarding (no certificate at all)

With the phone plugged in and USB debugging enabled:

1. Open `chrome://inspect/#devices` on the laptop.
2. Click **Port forwarding**, add `5173 → localhost:5173` and `3000 → localhost:3000`.
3. On the phone, browse to `http://localhost:5173`.

Because the phone sees it as *localhost*, it is treated as secure and installs properly.
Good for testing; not useful for day-to-day use since it needs the cable.

## Production

Serve the apps behind the Nginx gateway with a real certificate (Let's Encrypt or your
company's). Everything is same-origin then: no CORS configuration, no warnings, and the
apps install cleanly on any device.

## Verifying an install worked

- The app opens **without** the browser address bar.
- It appears as its own entry in the phone's app switcher.
- Chrome DevTools → *Application → Manifest* shows no installability errors.
- Chrome DevTools → *Application → Service Workers* shows an activated worker.
