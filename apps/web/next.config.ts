import path from "node:path";
import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

// Monorepo root, so Next.js can compile the shared workspace packages.
const repoRoot = path.join(process.cwd(), "..", "..");

/** Where the Next.js server forwards /api/* (the API server, reachable from this server). */
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Same-origin API: the browser calls /api/*, Next.js forwards to the API server.
  // Staff/guest cookies therefore stay first-party. In production a reverse proxy
  // can route /api and /socket.io to the API directly instead.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` },
      // Uploaded menu photos (stored by the API).
      { source: "/uploads/:path*", destination: `${apiInternalUrl}/uploads/:path*` },
      // Socket.io (long-polling handshake + fallback). Trailing slash is required by Socket.io.
      { source: "/socket.io/", destination: `${apiInternalUrl}/socket.io/` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
  // Requests to /api pass through src/proxy.ts, which by default cuts bodies off at
  // 10 MB. Photo uploads can be up to MAX_UPLOAD_MB (at most 20).
  experimental: { proxyClientMaxBodySize: "25mb" },
  // Self-contained server bundle for the Docker image (see apps/web/Dockerfile).
  output: "standalone",
  // Let /socket.io/ keep its trailing slash instead of being redirected.
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@app/config", "@app/shared"],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  images: {
    // WebP only: nearly as small as AVIF on mobile networks, but encodes many times
    // faster. AVIF encoding is CPU-heavy and runs on Node's small worker pool,
    // which the API proxy also uses — a cold menu of 25 photos could stall API
    // calls for seconds.
    formats: ["image/webp"],
    deviceSizes: [384, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 320],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
