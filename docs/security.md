# Security overview

How the app protects guests, staff and money, and where each protection lives in the code.
Every item below is covered by automated tests (unit, integration, or end-to-end in `e2e/`).

## Who can do what

| Actor | How they prove it | Can |
| --- | --- | --- |
| Guest | Signed table QR token (HMAC-SHA256) → per-device guest cookie | Order, call, pay, and rate **their own table's** visit only |
| Kitchen / Waiter | PIN (argon2id-hashed) → staff session cookie | Kitchen display / waiter screen |
| Manager | Email + password (argon2id) → staff session cookie | Everything, including the admin area |

- Roles are enforced **on the server for every request** (`packages/shared/src/api/routes.ts`
  declares each route's access, and the registrar applies it). The web app's gates only hide screens.
- Socket.io connections are authenticated the same way and placed in role/table rooms. A guest
  socket never receives another table's events.
- Table QR tokens can be rotated per table (Admin → Tables), which invalidates the old printout. They don't expire, because they're printed. Instead, joining an occupied table needs that visit's 6-digit PIN, shown on seated guests' phones and to managers (`apps/api/src/sessions/join-pin.ts`). A guest's access ends when the visit closes.
- Closing a visit, signing out, removing staff or resetting a PIN or password cuts live sockets immediately, including ones that try to recover a dropped connection.
- Socket.io refuses other websites' origins, limits new connections per address, and validates every event.

## Brute force & abuse

- **Per-IP rate limits**: 600 requests/min overall, 30/min on sensitive actions, 10/min on logins and discount codes, 10/hour on bookings. Where the web server reaches the API over the internet, it names the visitor using `INTERNAL_PROXY_SECRET`.
- **Per-visit limits**: 10 wrong join PINs or 5 wrong discount codes in 15 minutes stop further tries.
- **Per-account lockout** (`apps/api/src/auth/lockout.ts`): after 5 wrong PINs or passwords the account
  is locked for 15 minutes, and each further failure doubles the lock (up to 24 h).
- Login errors never reveal whether the account exists.
- "Call server" has a per-table cooldown. Request bodies are capped at 100 kB, uploads at `MAX_UPLOAD_MB`.

## Sessions & cookies

- Cookies are `HttpOnly`, `SameSite=Lax`, signed, and `Secure` in production (the API won't start otherwise).
- Staff sessions are stored server-side and can be revoked, and last at most 24 hours in production. Signing out revokes the session.
- **CSRF**: every state-changing request must come from an allowed `Origin` and be JSON, so a
  plain HTML form on another site can't post. Payment webhooks are exempt; they're verified by signature.

## Browser hardening (web app)

`apps/web/src/proxy.ts` and `apps/web/src/lib/security-headers.ts` add the following:

- **Content-Security-Policy** with a fresh random nonce per request. Only the app's own scripts run.
  Injected `<script>` tags and `onerror=` handlers are blocked. `e2e/security.spec.ts` checks this in a real browser.
- No framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), `nosniff`, HSTS.
- `Referrer-Policy: same-origin`, so table links (which contain the table token) never leak to other sites.
- React escapes everything it renders. The only raw HTML is the theme script, which is built from `config/brand.ts`, never from user input.

The API sends its own strict headers (`helmet`, CSP `default-src 'none'`), and CORS allows only `CORS_ORIGINS`.

## Data & money

- **Server is the source of truth**: prices, totals, discounts, tax and splits are always
  recalculated on the server. Whatever the phone sends is only a request.
- Money is stored in integer cents. Splits use exact largest-remainder rounding, so they add up to the total.
- **Idempotency keys** on order submission and payments (stored in the same transaction), plus
  database advisory locks around money changes. A double tap or a retry over a bad network never
  charges or orders twice.
- All input is validated with Zod (`packages/shared/src/api/schemas.ts`). Unknown fields are stripped
  before the request reaches any handler.
- Uploaded images are re-encoded with `sharp` (which strips metadata and anything hidden in the file)
  and stored under random names.
- CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`) in dish names and notes.
- The **audit log** records sign-ins, staff, menu, table, discount, order, call, payment and
  review changes, with the actor and IP. It can't be edited from the app.
- Logs redact cookies, `Authorization` headers and table, receipt and booking links. Bookings (name and phone) are deleted after `RESERVATION_RETENTION_DAYS`. The database refuses edits and deletes on the audit log.

## Secrets

- All secrets come from environment variables (`.env`, never committed). In production the API
  refuses to start with missing, short, reused or example secrets.
- `npm audit` reports no known vulnerabilities in production dependencies (checked at Phase 10).

## Reporting a problem

If you find a security issue, contact the restaurant's technical owner privately rather than
opening a public issue.
