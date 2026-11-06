/**
 * Security headers for every page served by the web app.
 *
 * Content-Security-Policy (per request, see src/proxy.ts):
 *  • scripts: only Next.js's own bundles and inline scripts carrying this
 *    request's random nonce ('strict-dynamic' lets those load their chunks).
 *    An injected <script> or onclick="…" can't run.
 *  • styles: 'unsafe-inline' is required for React `style={{…}}` props
 *    (animations, charts). CSS can't execute code, so the risk is small.
 *  • everything else (images, fonts, API, Socket.io) is same-origin only,
 *    because the API is reached through this server (/api, /socket.io).
 *  • nobody may frame the app (clickjacking).
 *
 * To add a third party (e.g. Stripe.js), extend the matching directive here.
 */
export function buildCsp(opts: { nonce: string; dev: boolean; https: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${opts.nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(opts.dev ? ["ws:", "wss:"] : [])],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (opts.https) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** A fresh, unguessable nonce for one response. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Headers that are the same for every response (set in next.config.ts). */
export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Table links contain the signed table token — never leak paths to other sites
  // (e.g. when a guest opens a public review link).
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Browsers ignore HSTS over plain HTTP, so this is safe in development too.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];
