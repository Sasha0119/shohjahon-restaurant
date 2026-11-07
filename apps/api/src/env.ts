import { z } from "zod";

/**
 * Environment variables for the API, validated at startup.
 * The server refuses to start with a missing or unsafe value, and the error
 * names every problem at once. See apps/api/.env.example.
 */

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

/** Values that only exist in .env.example and must never reach production. */
const EXAMPLE_SECRET = /change-me|example|placeholder/i;
const secret = z.string().min(32, "Must be at least 32 characters (use: openssl rand -base64 48)");

/** Long enough isn't strong enough: "aaaa…" or "password-password-…" must not reach production. */
export function isWeakSecret(value: string): boolean {
  return (
    new Set(value).size < 10 || /^(.{1,20})\1+$/.test(value) || /password|changeme|secret|qwerty|123456/i.test(value)
  );
}

const DEFAULT_DB_PASSWORD = /^(postgres|password|admin|root|secret|restaurant|change-?me.*)$/i;

/** A production database needs a real password, not a missing, short or default one. */
export function isWeakDatabaseUrl(databaseUrl: string): boolean {
  try {
    const password = decodeURIComponent(new URL(databaseUrl).password);
    return password.length < 8 || DEFAULT_DB_PASSWORD.test(password);
  } catch {
    return true;
  }
}

/** Longest staff session allowed in production. */
const MAX_PRODUCTION_SESSION_HOURS = 24;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    /** Set when running behind a reverse proxy / load balancer (for correct client IPs). */
    TRUST_PROXY: bool.default(false),

    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "Must be a postgresql:// URL"),

    /** Web origins allowed by CORS and Socket.io (comma-separated). */
    CORS_ORIGINS: csv,
    /** Public URL of the guest web app; QR codes point to <PUBLIC_WEB_URL>/table/<token>. */
    PUBLIC_WEB_URL: z.url(),

    /** Signs table QR tokens (HMAC-SHA256). Rotating it invalidates every printed QR code. */
    QR_TOKEN_SECRET: secret,
    /** Signs cookies (guest + staff session cookies). */
    COOKIE_SECRET: secret,
    /** Lets the web server name the visitor when it forwards to this API over the internet (see http/client-ip.ts). */
    INTERNAL_PROXY_SECRET: secret.optional(),
    /** Send cookies only over HTTPS. Must be true in production. */
    COOKIE_SECURE: bool.default(false),

    /** A table session with no activity for this long expires. */
    SESSION_IDLE_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(120),
    /** Staff stay logged in for this long. */
    STAFF_SESSION_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(12),
    /** Minimum seconds between two identical "Call server" requests from one table. */
    CALL_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),

    /** Bookings (with the guest's name and phone) are deleted this many days after their date. */
    RESERVATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),

    /** Folder for uploaded menu photos (served at /uploads). Use a persistent volume in production. */
    UPLOAD_DIR: z.string().min(1).default("uploads"),
    /** "database" keeps photos in Postgres instead (for hosts whose disk is wiped on restart). */
    IMAGE_STORE: z.enum(["local", "database"]).default("local"),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(20).default(5),

    PAYMENT_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    /** Optional: enables "email my receipt". e.g. smtp://user:pass@smtp.example.com:587 */
    SMTP_URL: z
      .string()
      .regex(/^smtps?:\/\//)
      .optional(),
    EMAIL_FROM: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (env.PAYMENT_PROVIDER === "stripe") {
      if (!env.STRIPE_SECRET_KEY) issue("STRIPE_SECRET_KEY", "Required when PAYMENT_PROVIDER=stripe");
      if (!env.STRIPE_WEBHOOK_SECRET) issue("STRIPE_WEBHOOK_SECRET", "Required when PAYMENT_PROVIDER=stripe");
    }
    if (env.SMTP_URL && !env.EMAIL_FROM) issue("EMAIL_FROM", "Required when SMTP_URL is set");
    if (env.QR_TOKEN_SECRET === env.COOKIE_SECRET) issue("COOKIE_SECRET", "Must differ from QR_TOKEN_SECRET");

    if (env.NODE_ENV === "production") {
      if (EXAMPLE_SECRET.test(env.QR_TOKEN_SECRET)) issue("QR_TOKEN_SECRET", "Still the example value");
      if (EXAMPLE_SECRET.test(env.COOKIE_SECRET)) issue("COOKIE_SECRET", "Still the example value");
      if (isWeakSecret(env.QR_TOKEN_SECRET)) issue("QR_TOKEN_SECRET", "Too weak (use: openssl rand -base64 48)");
      if (isWeakSecret(env.COOKIE_SECRET)) issue("COOKIE_SECRET", "Too weak (use: openssl rand -base64 48)");
      if (env.INTERNAL_PROXY_SECRET && isWeakSecret(env.INTERNAL_PROXY_SECRET)) {
        issue("INTERNAL_PROXY_SECRET", "Too weak (use: openssl rand -base64 48)");
      }
      if (env.CORS_ORIGINS.some((o) => !o.startsWith("https://")))
        issue("CORS_ORIGINS", "Must use https:// in production");
      if (isWeakDatabaseUrl(env.DATABASE_URL)) issue("DATABASE_URL", "The password is missing, short or a default");
      if (env.STAFF_SESSION_HOURS > MAX_PRODUCTION_SESSION_HOURS) {
        issue("STAFF_SESSION_HOURS", `Must be at most ${MAX_PRODUCTION_SESSION_HOURS} in production`);
      }
      if (!env.COOKIE_SECURE) issue("COOKIE_SECURE", "Must be true in production (HTTPS)");
      if (!env.PUBLIC_WEB_URL.startsWith("https://")) issue("PUBLIC_WEB_URL", "Must use https:// in production");
      if (env.PAYMENT_PROVIDER === "stripe" && env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
        issue("STRIPE_SECRET_KEY", "Test key used in production");
      }
    }
  });

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n  • ${problems.join("\n  • ")}`);
    this.name = "EnvError";
  }
}

/** Parse and validate. Empty strings count as "not set". */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  return result.data;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
