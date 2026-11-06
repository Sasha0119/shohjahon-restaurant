import cookieParser from "cookie-parser";
import express, { type RequestHandler } from "express";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import { registerStaffAdminRoutes } from "./admin/staff-routes.ts";
import { registerAuthRoutes } from "./auth/routes.ts";
import { STAFF_COOKIE, resolveStaffSession } from "./auth/session.ts";
import type { Db } from "./db.ts";
import type { Env } from "./env.ts";
import { errorHandler, notFoundHandler } from "./http/errors.ts";
import { createRegistrar } from "./http/registrar.ts";
import { corsMiddleware, createRateLimiters, originGuard, securityHeaders } from "./http/security.ts";
import type { Realtime } from "./realtime/types.ts";
import { registerReservationRoutes } from "./reservations/routes.ts";
import { registerSessionRoutes } from "./sessions/routes.ts";
import { GUEST_COOKIE, resolveGuest, resolveGuestIncludingClosed } from "./sessions/service.ts";
import { registerTableAdminRoutes } from "./tables/admin-routes.ts";
import { registerMenuRoutes } from "./menu/routes.ts";
import { registerOrderRoutes } from "./orders/routes.ts";
import { createSmtpMailer, type Mailer } from "./billing/mailer.ts";
import { createMockProvider, mockWebhookSecret, type PaymentProvider } from "./billing/provider.ts";
import { registerBillingRoutes } from "./billing/routes.ts";
import { registerReviewRoutes } from "./reviews/routes.ts";
import { registerReportRoutes } from "./reports/routes.ts";
import { createDatabaseImageStore, createLocalImageStore, type ImageStore } from "./uploads/image-store.ts";
import { registerUploadRoutes } from "./uploads/routes.ts";

export interface AppDeps {
  db: Db;
  env: Env;
  logger: Logger;
  realtime: Realtime;
  /** Defaults to IMAGE_STORE: local disk at UPLOAD_DIR, or the database. */
  imageStore?: ImageStore;
  /** Defaults to the provider selected by PAYMENT_PROVIDER. */
  paymentProvider?: PaymentProvider;
  /** Defaults to SMTP (SMTP_URL + EMAIL_FROM), or none. */
  mailer?: Mailer | null;
  /** Tests disable rate limits so they can log in many times. */
  disableRateLimits?: boolean;
}

export function createApp({ db, env, logger, realtime, imageStore, paymentProvider, mailer, disableRateLimits }: AppDeps) {
  const provider = paymentProvider ?? defaultProvider(env);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY ? 1 : false);

  const limiters = createRateLimiters({ disabled: disableRateLimits });

  app.use(
    pinoHttp({
      logger,
      redact: ["req.headers.cookie", "res.headers['set-cookie']", "req.headers.authorization"],
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );
  app.use(securityHeaders());
  app.use(corsMiddleware(env.CORS_ORIGINS));
  app.use("/api", limiters.global);
  app.use(originGuard(env.CORS_ORIGINS));
  // Payment webhooks are verified against the exact bytes received.
  app.use("/api/payments/webhook", express.raw({ type: "*/*", limit: "200kb" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // Reads the staff cookie; rejection happens per route via the route table.
  const loadStaff: RequestHandler = async (req, _res, next) => {
    req.staff = (await resolveStaffSession(db, req.cookies?.[STAFF_COOKIE])) ?? undefined;
    next();
  };

  // Requires an open table session; 401 NO_SESSION / 410 SESSION_CLOSED otherwise.
  const sessionCfg = { qrSecret: env.QR_TOKEN_SECRET, idleMinutes: env.SESSION_IDLE_MINUTES };
  const requireGuest: RequestHandler = async (req, _res, next) => {
    req.guest = await resolveGuest(db, realtime, sessionCfg, req.cookies?.[GUEST_COOKIE]);
    next();
  };

  const requireGuestIncludingClosed: RequestHandler = async (req, _res, next) => {
    req.guest = await resolveGuestIncludingClosed(db, realtime, sessionCfg, req.cookies?.[GUEST_COOKIE]);
    next();
  };

  const { router, on, mounted } = createRegistrar({ limiters, loadStaff, requireGuest, requireGuestIncludingClosed });

  // A free Neon database sleeps when idle and takes a few seconds to wake, so
  // retry briefly before reporting it unreachable (no false "unhealthy" alerts).
  on("GET", "/api/health", async (_req, res) => {
    if (await dbReachable(db)) res.json({ status: "ok", db: "ok", time: new Date().toISOString() });
    else res.status(503).json({ status: "degraded", db: "unreachable" });
  });

  registerAuthRoutes(on, db, env);
  registerStaffAdminRoutes(on, db);
  registerSessionRoutes(on, db, env, realtime);
  registerTableAdminRoutes(on, db, env, realtime);
  registerReservationRoutes(on, db, realtime);
  registerMenuRoutes(on, db, realtime);
  registerOrderRoutes(on, db, env, realtime);
  registerReviewRoutes(on, db, realtime);
  registerReportRoutes(on, db);
  registerBillingRoutes(on, db, realtime, provider, mailer === undefined ? createSmtpMailer(env.SMTP_URL, env.EMAIL_FROM) : mailer);
  const store =
    imageStore ?? (env.IMAGE_STORE === "database" ? createDatabaseImageStore(db) : createLocalImageStore(env.UPLOAD_DIR));
  registerUploadRoutes(on, db, store, env.MAX_UPLOAD_MB);

  // Uploaded photos: random file names, never overwritten → cache forever.
  app.use(
    "/uploads",
    express.static(env.UPLOAD_DIR, { index: false, dotfiles: "deny", immutable: true, maxAge: "365d", fallthrough: true }),
  );
  if (store.load) {
    const load = store.load.bind(store);
    app.get("/uploads/:name", async (req, res, next) => {
      try {
        const data = await load(req.params.name);
        if (!data) return next();
        res.set({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" }).send(data);
      } catch (e) {
        next(e);
      }
    });
  }
  app.use("/api", router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, mounted };
}

/** Up to ~10 s of retries, enough for a sleeping Neon database to wake. */
async function dbReachable(db: Db, attempts = 4): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.$queryRaw`SELECT 1`;
      return true;
    } catch {
      if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  return false;
}

/** The payment provider chosen in .env. */
function defaultProvider(env: Env): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "mock") return createMockProvider(mockWebhookSecret(env.COOKIE_SECRET));
  // A Stripe adapter implements PaymentProvider (see billing/provider.ts) and is passed to createApp.
  throw new Error(
    "PAYMENT_PROVIDER=stripe needs a Stripe adapter implementing PaymentProvider (billing/provider.ts). Use PAYMENT_PROVIDER=mock until it is added.",
  );
}
