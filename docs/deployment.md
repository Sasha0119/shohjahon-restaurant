# Deployment guide

This guide puts the app on one Linux server (a €5–20/month VPS is plenty for a
restaurant) with Docker. It runs four containers:

```
Internet ──443──▶ Caddy (HTTPS) ──┬─ /api, /socket.io, /uploads ─▶ API (Express + Socket.io) ─▶ PostgreSQL
                                  └─ everything else ────────────▶ Web (Next.js)
```

Only Caddy is exposed. The database is reachable only by the API.

---

## 1. What you need

- A server with **Docker Engine 24+** and the **Compose plugin** (`docker compose version`).
  2 GB RAM is enough. The first build needs about 4 GB of disk space.
- A **domain**, e.g. `order.your-restaurant.com`, with an **A/AAAA record pointing at the server**.
- Ports **80 and 443 open**. Caddy uses port 80 to get the free Let's Encrypt certificate.

## 2. First install

```bash
git clone <your repo> restaurant && cd restaurant
cp .env.docker.example .env
```

Edit `.env` and fill in **every** value:

| Variable | What to put |
| --- | --- |
| `DOMAIN` | `order.your-restaurant.com` (no `https://`) |
| `ACME_EMAIL` | your email, for certificate expiry notices |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `QR_TOKEN_SECRET` | `openssl rand -hex 32` |
| `COOKIE_SECRET` | `openssl rand -hex 32` (different from the one above) |
| `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD` | the first manager login (password ≥ 8 characters) |

The API refuses to start in production if a secret is missing, too short, still the
example value, or if `COOKIE_SECURE`/`https` aren't set. The error lists every problem at once.

Build and start:

```bash
docker compose up -d --build
docker compose ps            # wait until api and web show "healthy"
```

The API applies database migrations automatically every time it starts.

Create the manager account and the starter menu (**first time only**; safe to re-run):

```bash
docker compose run --rm api npx tsx prisma/seed.ts
```

Then:

1. Open `https://order.your-restaurant.com/staff/manager` and sign in as the manager.
2. **Admin → Staff**: add your waiters and kitchen staff, each with their own PIN.
3. **Admin → Menu**: replace the demo dishes with your own.
4. **Admin → Tables**: set your table numbers and print the QR codes.

To rebrand (name, colours, logo, prices, tax, Wi-Fi…), edit `config/brand.ts` and rebuild
(step 3 below).

## 3. Updating

```bash
git pull
docker compose up -d --build     # rebuilds, migrates, restarts with a few seconds of downtime
docker image prune -f            # optional: free disk space
```

Guests' phones and staff tablets reconnect automatically and catch up.

## 4. Backups (do this!)

Two things hold data: the **database** and the **uploaded menu photos**.

```bash
# Database → compressed file (run daily from cron)
docker compose exec -T db pg_dump -U restaurant -Fc restaurant > backup-$(date +%F).dump

# Photos
docker run --rm -v restaurant_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .
```

(The volume name is `<folder name>_uploads`. Check it with `docker volume ls`.)
Copy backups **off the server**, e.g. to S3 or Backblaze. To restore the database:

```bash
docker compose exec -T db pg_restore -U restaurant -d restaurant --clean --if-exists < backup-2026-11-03.dump
```

Test a restore once, before you need it.

## 5. Operations

| Task | Command |
| --- | --- |
| Logs (JSON, one line per request) | `docker compose logs -f api` |
| Health | `curl https://$DOMAIN/api/health` → `{"status":"ok","db":"ok"}` |
| Restart one service | `docker compose restart api` |
| Open a database shell | `docker compose exec db psql -U restaurant` |
| Stop everything | `docker compose down` (data volumes are kept) |

The containers restart automatically after a crash or a server reboot (`restart: unless-stopped`).

## 6. Taking real payments

The app ships with the **mock** payment provider: guests see the full flow, but no money
moves. Card amounts ending in `13` (e.g. 85 013 soʻm) are declined, so you can test that path. To take real
payments, the Stripe provider in `apps/api/src/billing/provider.ts` must be implemented.
The interface, webhook route, idempotency and audit log are already in place. Then set
`PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The API rejects
`sk_test_` keys in production. You'll also need to allow `https://js.stripe.com` in
`apps/web/src/lib/security-headers.ts` (`script-src`, `frame-src`, `connect-src`).

Cash payments work today: the guest taps **Cash**, and the waiter confirms the payment on their phone.

## 7. Scaling notes

One API container handles a busy restaurant (hundreds of concurrent phones). If you ever
run **more than one API instance**, you'll need:

- a shared **rate-limit store** (e.g. Redis) in `apps/api/src/http/security.ts`,
- the **Socket.io Redis adapter**, so live updates reach phones connected to other instances,
- sticky sessions for Socket.io long-polling at the load balancer,
- a shared disk or object storage for `uploads`.

## 8. Without Docker

You can also run it directly with Node.js 22+ and PostgreSQL 15+:

```bash
npm ci
cp apps/api/.env.example apps/api/.env       # fill in; NODE_ENV=production, COOKIE_SECURE=true
npm run db:deploy && npm run db:seed
API_INTERNAL_URL=http://127.0.0.1:4000 npm run build
npm run start -w @app/api                    # API on :4000
npm run start                                # web on :3000
```

Put any HTTPS reverse proxy in front, using the same routes as `deploy/Caddyfile`, and run
both processes under a supervisor such as systemd or pm2.

## 9. Pre-launch checklist

- [ ] `https://` works and `http://` redirects to it (Caddy does this automatically).
- [ ] You signed in as the manager and **changed the seeded password**.
- [ ] `SEED_DEMO_STAFF=false`, and no demo PINs (1234 / 4321) exist under Admin → Staff.
- [ ] Real staff each have their own PIN.
- [ ] Table QR codes are printed **from this domain**. Scan one with a phone and place a test order.
- [ ] Tax %, service %, currency, opening hours and Wi-Fi details in `config/brand.ts` are correct.
- [ ] A nightly backup runs **and has been restored once** as a test.
- [ ] `docker compose logs api` shows no errors after the test order.

## 10. Free hosting: Render + Neon

No server to manage: Render builds both Docker images straight from GitHub, and
the database lives on Neon. Everything is in `render.yaml`.

1. **Neon** (neon.tech, sign in with GitHub): create a project, then copy the
   connection string with **connection pooling turned off** (the direct one).
2. **Render** (render.com, sign in with GitHub): **New → Blueprint**, pick this
   repository, then fill in:
   - `DATABASE_URL`: the Neon string.
   The manager sign-in (`SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD`) is set
   in `render.yaml`; change the password in Admin → Staff after signing in.
3. Click **Apply**. The first build takes about 10 minutes. On the API's first
   start, `SEED_IF_EMPTY=true` loads the menu, tables and manager into the empty
   database; later restarts skip it, so menu edits are never overwritten.
4. Open `https://shohjahon.onrender.com`. If Render gave a service a different
   URL (a suffix is added when a name is taken), set `API_INTERNAL_URL` on the
   web service and `CORS_ORIGINS` + `PUBLIC_WEB_URL` on the API to the real URLs,
   then redeploy both.

Every push to `main` redeploys automatically.

**Free-plan limits:**
- Services sleep after 15 minutes without visitors; the next visit waits about
  a minute while they wake up. Fine for a demo; use a paid plan for a real
  restaurant.
- The disk is wiped on every restart and deploy: **photos uploaded in the admin
  are lost**. The demo menu photos are links and are not affected.
- Live updates use Socket.io long-polling through the website (a little slower
  than WebSockets, but they work).
- Print table QR codes only once the final URL is settled: they encode it.
