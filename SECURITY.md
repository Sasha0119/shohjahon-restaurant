# Security

How protections work, in detail: [docs/security.md](docs/security.md). How to deploy: [docs/deployment.md](docs/deployment.md).

## Reporting a problem

Please don't open a public issue. Use GitHub's private vulnerability reporting on this repository, or contact the owner directly.

## Before going live

1. **Change the manager password** in Admin → Staff. An old one is in this public repository's git history.
2. **Connect a real payment provider.** With `PAYMENT_PROVIDER=mock`, card payments and booking deposits are only recorded: no money moves, so anyone can close a bill or book a table for free.
3. **Set secrets from `openssl rand -hex 32`.** The API won't start in production with weak or example values, a default database password, or anything other than HTTPS.
4. **Keep the database off the internet**, and run the API with a limited database login (`restaurant_app`, see below).
5. **Back up nightly, and test a restore once** ([docs/deployment.md](docs/deployment.md#4-backups-do-this)).

## Database logins

| Login | Used by | Can |
| --- | --- | --- |
| `POSTGRES_USER` (owner) | The `migrate` service only: migrations and the seed | Change tables |
| `restaurant_app` | The running API | Read and change rows only. It can't change tables, or edit or delete the audit log |

`docker compose` sets this up (`deploy/db-app-role.sh`). On a host with one database login, such as Render with Neon, create a second login the same way and run migrations with the owner.

## Known limits

- A photo of a table's QR code can start a visit on an **empty** table. Joining an occupied table needs that visit's 6-digit PIN.
- Anyone can temporarily lock a staff account with wrong PINs, because the sign-in screen lists staff. A manager can unlock it by resetting the PIN.
- Someone with a QR photo can block new people joining that table for 15 minutes with wrong PINs.
- The page security policy allows inline styles, which React's `style` props need. Inline CSS can't run scripts.
- Rate limits are kept in memory, so they assume one API instance and reset when it restarts.
