# Restaurant Ordering — rebrandable QR ordering web app

Guests scan the QR code on their table, browse the menu, order together, follow
their order live, call a server, and pay — all in the browser, no app install.

Staff get a kitchen display, a waiter screen and an admin area with analytics.

> **Status: complete (Phases 1–10).** Payments use a built-in **mock** provider until
> Stripe is connected (see [docs/deployment.md](docs/deployment.md#6-taking-real-payments)).
> Deploying: [docs/deployment.md](docs/deployment.md) · Security: [docs/security.md](docs/security.md)

## Quick start

Requires Node.js 20.19+ (tested on Node 24) and PostgreSQL 14+ (UTF-8).

```bash
npm install
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL + the two secrets
npm run db:deploy && npm run db:seed     # tables, demo menu, manager + demo PIN staff
npm run dev:api                          # API on :4000
npm run dev                              # web on http://localhost:3000
```

The seed prints a link for every table. Open one on your phone (or in a narrow browser
window) to be a guest. Staff sign in at `/staff` (PIN) or `/staff/manager` (email).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the web app in development mode |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | Unit tests; add `TEST_DATABASE_URL` for database integration tests (Vitest) |
| `npm run test:e2e` | Browser end-to-end tests (Playwright), see "Testing" below |
| `npm run typecheck` | Type-check every workspace |

## Rebrand in one file: `config/brand.ts`

The demo brand is **Shohjahon**, a premium modern Uzbek restaurant. Everything below lives in
`config/brand.ts`: name, tagline / welcome line / cuisine (in uz, en and ru), the wordmark logo
(a serif letter in a thin gold circle plus the name), hero photo, light/dark mode, currency
(UZS, shown as whole so'm: "85 000 soʻm"), tax %, service charge %, tip options, languages,
Wi-Fi, review links, opening hours and contact details. Hours, contact and Wi-Fi are demo values.

**Signature theme**: dark first (charcoal, warm gold, soft ivory) with a matching light mode,
Playfair Display headings and Inter body text (both include Cyrillic and Uzbek ʻ ʼ letters).
Colours are in `config/themes.ts` and become CSS variables (`--primary-color`, `--bg-color`,
`--font-family`, …). Components only use those tokens, so changing one value restyles the app.
A test checks every colour pair for WCAG AA contrast.

**Languages**: Uzbek (Latin, default), English and Russian. Guests and staff switch language in
the header, and the choice is remembered on the device. Text lives in `apps/web/src/i18n/`
(`uz.ts`, `en.ts`, `ru.ts`). A test checks that all three have the same keys and placeholders,
that Uzbek contains no Cyrillic letters, and that every Russian plural has all its forms.
Server errors are shown by error code in the current language.

**Logo & icons**: `components/brand/logo.tsx` (`<Logo />` mark, `<Wordmark />` mark + name). The
favicon, Apple icon and PWA icons (including a maskable one) are drawn from the same mark at
build time. The icon font is bundled in `apps/web/src/assets/fonts` (SIL Open Font License).

**Photos**: `apps/web/public/images` (see `CREDITS.md` there). **Menu data**:
`packages/shared/src/seed/menu.ts`.

**Menu in three languages**: the main columns hold Uzbek; English and Russian sit in a
`translations` JSON column on categories, items, modifier groups/options and combos (migration
`20261104000000_menu_translations`, additive only). In the admin item editor and the category and
combo sheets, an **Editing language** bar switches the text fields between the languages. Empty
translations fall back to Uzbek. Guests, the kitchen display and the dashboard show dish names in
their own language. Order tickets and receipts keep the name as it was ordered.

**Guest screens** (Step 2): a full-screen hero, a menu with sticky underlined category tabs, search
(ignores ʻ ʼ apostrophes) and a "sold out" seal, an item sheet, a cart with who-added-what avatars
and a floating bar, an order progress bar, a bill/split screen showing who pays what, and a gold
success animation after sending or paying.

**Staff screens** (Step 3): an admin sidebar with the wordmark, gold KPI tiles and serif chart
titles, a kitchen display with large 64px buttons and dish names in the cook's language, waiter
call cards with ringed icons, an ivory paper receipt with the logo and gold rules, and printable
QR table cards in the same style.

**Formatting without browser data**: Chrome ships no Uzbek number or date data. Prices, counts,
dates ("4-noyabr, 2026") and relative times ("5 daqiqa oldin") are built by hand for Uzbek in
`apps/web/src/lib/format.ts`, and tests cover them.

## Database (Phase 2)

Needs PostgreSQL 14+ with a **UTF-8** database.

```bash
cp apps/api/.env.example apps/api/.env   # then set DATABASE_URL and the two secrets
npm run db:deploy                        # apply migrations
npm run db:seed                          # demo menu, 12 tables, manager + demo PIN staff
```

- Schema: `apps/api/prisma/schema.prisma` · migration: `apps/api/prisma/migrations/`
- API routes: [`docs/api.md`](docs/api.md) (generated: `npm run docs:api`)
- Contracts shared by server and web: `packages/shared/src/api/` (Zod schemas, route table, Socket.io events, DTOs)
- DB integration tests: `TEST_DATABASE_URL=postgresql://…/fresh_empty_db npm test`

## Running the API + staff screens (Phase 3)

```bash
npm run dev:api      # API on http://localhost:4000 (needs apps/api/.env + a migrated DB)
npm run dev          # web on http://localhost:3000 — it forwards /api/* to the API
```

| Screen | URL | Sign in with |
| --- | --- | --- |
| Waiter / kitchen | `/staff` | tap your name, enter PIN |
| Manager | `/staff/manager` | email + password (`SEED_MANAGER_*` in `.env`) |
| Staff management | `/admin/staff` | manager only |

Demo PIN accounts (dev only, when `SEED_DEMO_STAFF=true`) are listed in `apps/api/prisma/seed.ts`.

**Security model:** opaque random session tokens in an httpOnly, SameSite=Lax cookie (only a
SHA-256 hash is stored); Argon2id for passwords and PINs; account lockout after 5 wrong attempts
(15 min, doubling); per-IP rate limits on sign-in; Origin + JSON checks against CSRF; Helmet
headers; every route's access rule comes from the route table, so a handler can't skip it;
PIN/password reset and deactivation sign the person out everywhere; staff changes and sign-ins
are audit-logged.

## Table sessions & realtime (Phase 4)

Guests open `/table/<signed-token>` from the table's QR code (`npm run db:seed` prints dev
links for tables 1–3; managers print all codes from **Admin → Tables → Print QR codes**).

| Situation | What the guest sees |
| --- | --- |
| First scan at a free table | A new session opens |
| Reload / rescan | Rejoins the same session (httpOnly guest cookie) |
| Others already ordering | "Table 4 already has an order going — join them?" |
| Seated at another table | "You're at Table 5 — switch to Table 7?" |
| Forged / unknown code | "This QR code isn't valid" |
| Code replaced by a manager | "This QR code has been replaced" |
| Visit closed (paid / staff / idle) | "This visit has ended" → *Start a new order* opens a fresh session |

- QR tokens are HMAC-signed (`QR_TOKEN_SECRET`); *Replace QR code* invalidates a table's printed code.
- Idle sessions close after `SESSION_IDLE_MINUTES` — never while something has been ordered.
- One open session per table is guaranteed by the database, even when phones scan at the same instant.
- Socket.io (via `/socket.io/`, proxied by Next.js like `/api`) pushes changes; every event carries
  the session `version` and phones resync automatically after a gap or reconnect.

## Menu & menu management (Phase 5)

- Guests load the menu from `GET /api/menu` (ETag-cached; a 304 when nothing changed). It refreshes
  instantly on `menu:updated` / `menu:stock`, every 5 minutes, and when the tab is reopened.
- **Admin → Menu**: items (search, category filter, in-stock switch, reorder), categories (station,
  visibility, time windows, reorder), combo deals. **Item editor**: photo upload, price, description,
  dietary tags, allergens, option groups (required / max choices / extra price / default /
  available), "goes well with" pairings, sold-out / chef's pick / archived.
- Time-based menus use `timezone` from `config/brand.ts` (servers usually run in UTC).
- Photo uploads are decoded and re-encoded to WebP by `sharp` (max 1600 px, metadata stripped,
  non-images rejected) and stored in `UPLOAD_DIR` under random names — use a persistent volume in production.
- Archived items stay in the database so past orders and reports keep working.

## Cart, orders, kitchen display & call server (Phase 6)

- **Shared cart** on the server: everyone at the table adds, changes and removes lines; every
  phone updates live. Prices and options are always checked against the live menu by the server.
- **Send to kitchen** is exactly-once: it needs an `Idempotency-Key` (retries replay the first
  result) and the cart version the guest saw (two people tapping Send at once → one order).
  Sold-out or hidden items are refused with a clear message and the cart is left untouched.
- Each round becomes one ticket per station (kitchen / bar). Guests see one status per round
  (the least advanced ticket). Cancelling is all-or-nothing and only while everything is "Received".
- **Kitchen** (`/kitchen`, PIN): New → Preparing → Ready → Served columns, oldest first, live timer
  that turns amber/red after `kitchen.warnAfterMinutes` / `lateAfterMinutes` (brand.ts), sound +
  flashing card for new tickets with mute, station filter, and an out-of-stock switchboard.
- **Floor** (`/waiter`, PIN): live calls with table number and time, one-tap "Done", sound alerts,
  live table status, close a table's session.
- **Call server** has a per-table, per-type cooldown (`CALL_COOLDOWN_SECONDS`), race-free across phones.
- Every status change and call is audit-logged.

## Bill, payments & receipts (Phase 7)

- **The bill is computed on the server**: subtotal − combo savings − discount code = net, + service
  + tax = total. Tips are added per payment, on each payer's share.
- **Split** full / evenly (N people) / by item (pays the item's fair share of service, tax and
  discounts) / custom amount — exact to the cent; shared rules in `packages/shared/src/payments.ts`.
- **Partial payments**: each payment reduces the balance; items paid "by item" can't be paid twice;
  the table closes automatically once the balance is exactly zero.
- **Exactly-once**: every payment needs an `Idempotency-Key`; payments for one table are serialised,
  so two people paying the full bill at once can't both be charged.
- **Providers**: `PaymentProvider` interface (`apps/api/src/billing/provider.ts`). The built-in mock
  approves everything except amounts ending in **13** (e.g. 85 013 soʻm), which it declines — use that to
  try the failure flow. A Stripe adapter implements the same interface.
- **Cash**: reserves the amount and alerts the waiter ("Paying cash $19.65" → *Cash received*).
- **Receipts**: `/receipt/<token>` (unguessable link, printable) + "Email me this receipt" when
  `SMTP_URL` / `EMAIL_FROM` are set.
- **Discount codes**: Admin → Discounts (percent or amount off, usage limit, minimum order, dates,
  on/off). Codes can't be changed once a table has started paying.

## Reviews & feedback log (Phase 8)

- Guests rate their visit (1–5 stars + optional comment) **only after paying**: in the payment
  sheet after paying a share, or on the "Thanks for visiting" screen once the bill is settled
  (works for 24 h after the table closes). One rating per guest per visit.
- **4–5 stars** → thank-you plus your public review links (`reviewLinks` in `config/brand.ts`).
- **1–3 stars** → saved privately to **Admin → Feedback** (live, with a "new" badge in the menu);
  mark items handled / reopen them. Public ratings are stored too (for average-rating analytics)
  but never appear in the log.

## Admin dashboard & analytics (Phase 9)

Managers now land on **Admin → Overview** after signing in.

- **Overview** — revenue, orders, average bill, guests and tips, each compared with the
  previous period of the same length; sales per day; top 10 items; ratings breakdown; busiest
  hours (weekday × hour heat map). Date presets: today / 7 / 30 / 90 days / custom (max 366 days).
  Every chart has hover + keyboard read-outs (focus a chart, then use the arrow keys) and a
  "Show as table" view.
- **Orders** — every ticket, newest first, filterable by status, station and table, 25 per page.
  **Export CSV** downloads the same filters as one row per ordered item (opens cleanly in Excel /
  Google Sheets; text that looks like a formula is neutralised).
- **Audit log** — who did what and when (sign-ins, menu/table/discount changes, orders, calls,
  payments, reviews…), filterable by activity, with the raw details per entry.

How the numbers are counted:

| Metric | Definition |
| --- | --- |
| Revenue | Successful payments, **excluding tips**, by the time they completed |
| Orders | Rounds sent to the kitchen (a round with kitchen + bar items counts once); cancelled rounds excluded |
| Average bill | Revenue ÷ visits that had at least one payment |
| Guests | People who joined a table |
| Average rating | All ratings (public 4–5 and private 1–3) left in the period |

All days and hours follow the restaurant's time zone (`timezone` in `config/brand.ts`), not the
server's or the browser's. Chart colours come from each theme's `chart` colour (validated for
contrast and colour-blind readability in light and dark mode) — override it per brand in
`theme.overrides` if you change the primary colour.

## Project layout

```
config/                  @app/config — brand.ts, theme presets, CSS-variable generator
packages/shared/         @app/shared — types, money/bill/split/cart logic, seed menu
  src/seed/menu.ts       25 dishes · 5 categories · modifiers · tags · allergens · upsells
  src/api/               Zod request schemas, REST route table, Socket.io contract, DTOs
apps/api/                @app/api — Express + Socket.io + Prisma
  prisma/                Schema, migrations, seed
  src/                   auth, sessions, menu, orders, calls, billing, reviews, reports, realtime
  Dockerfile
apps/web/                @app/web — Next.js (App Router)
  src/app/table/[token]/ Guest: home, menu, cart, bill, wifi
  src/app/kitchen, waiter, staff, admin/  Staff screens
  src/components/        ui/ primitives · guest/ · staff/ · admin/ (incl. charts)
  src/i18n/              Translations + typed translator
  src/proxy.ts           Per-request Content-Security-Policy
  Dockerfile
e2e/                     Playwright end-to-end tests
deploy/Caddyfile         HTTPS reverse proxy for docker-compose.yml
docs/                    api.md (generated) · deployment.md · security.md
```

All money is handled as integer cents; tax, service and tip use integer
basis-point maths with half-up rounding, and bill splits always add up exactly.

## Security, testing & deployment (Phase 10)

**Hardening added in this phase** (full overview in [docs/security.md](docs/security.md)):
- Every page gets a strict **Content-Security-Policy** with a fresh nonce per request. Only the
  app's own scripts can run, so injected scripts and `onerror=` handlers are blocked. The app also
  sends no-framing, `nosniff`, HSTS and `Referrer-Policy: same-origin` headers, so table links
  never leak to other sites.
- **Fixed a realtime gap**: an event that arrived between a staff screen's first load and its
  socket connecting could be missed. Staff screens now catch up on *every* connect, and the
  kitchen subscribes to its stations before it refetches.
- The API logs and exits cleanly on unexpected crashes. Docker restarts it.

**Testing**

| Layer | Command | Covers |
| --- | --- | --- |
| Unit | `npm test` | money, splits, bills, hours, schemas, CSV, CSP, themes, i18n… |
| Integration | `TEST_DATABASE_URL=postgresql://…/postgres npm test` | every API route against a real PostgreSQL (a throwaway database per test file) |
| End-to-end | `E2E_DATABASE_URL=postgresql://…/restaurant_e2e npm run test:e2e` | real browser: guest orders → kitchen/waiter live → card + cash + split payments → ratings → feedback; role gates; tampered QR; CSP in the browser |

The end-to-end run builds the web app for production, **drops and re-creates** the database
named in `E2E_DATABASE_URL` (the name must end in `_e2e`), and starts both servers itself.
First install the browser with `npx playwright install chromium`, or use an installed Chrome
with `PW_CHANNEL=chrome`.

**Deployment**: `docker-compose.yml` runs PostgreSQL, the API, the web app and Caddy (automatic
HTTPS). Step by step, including backups and a pre-launch checklist:
[docs/deployment.md](docs/deployment.md).
