import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, createNonce } from "./lib/security-headers";

/**
 * Runs before every page request: creates a per-request nonce and the
 * Content-Security-Policy that only allows scripts carrying it. Next.js reads
 * the nonce from the request's CSP header and stamps it on its own scripts.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const https = request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development", https });

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only — not the proxied API, sockets, uploads or static build files.
      source: "/((?!api/|socket\\.io/|uploads/|_next/static|_next/image|favicon\\.ico|icon|apple-icon|manifest\\.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
