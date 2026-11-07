import { describe, expect, it } from "vitest";
import { STATIC_SECURITY_HEADERS, buildCsp, createNonce, withClientIp } from "../src/lib/security-headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("Content-Security-Policy", () => {
  const prod = buildCsp({ nonce: "abc123", dev: false, https: true });

  it("only runs scripts that carry this request's nonce", () => {
    const s = directive(prod, "script-src");
    expect(s).toContain("'nonce-abc123'");
    expect(s).toContain("'strict-dynamic'");
    expect(s).not.toContain("'unsafe-inline'");
    expect(s).not.toContain("'unsafe-eval'");
  });

  it("keeps everything same-origin and forbids framing, plugins and foreign forms", () => {
    expect(directive(prod, "default-src")).toBe("default-src 'self'");
    expect(directive(prod, "connect-src")).toBe("connect-src 'self'");
    expect(directive(prod, "object-src")).toBe("object-src 'none'");
    expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(prod, "form-action")).toBe("form-action 'self'");
    expect(directive(prod, "base-uri")).toBe("base-uri 'self'");
    expect(prod).toContain("upgrade-insecure-requests");
  });

  it("relaxes only what local development needs", () => {
    const dev = buildCsp({ nonce: "n", dev: true, https: false });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("creates a different, unguessable nonce each time", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });
});

describe("static security headers", () => {
  const h = Object.fromEntries(STATIC_SECURITY_HEADERS.map((x) => [x.key, x.value]));
  it("blocks sniffing and framing, and never leaks table links in the Referer", () => {
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("same-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{7,}/);
  });
});

describe("withClientIp", () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it("names the visitor from the last forwarded address, with the secret", () => {
    const out = withClientIp(headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), "s3cret");
    expect(out.get("x-client-ip")).toBe("203.0.113.9");
    expect(out.get("x-internal-proxy-secret")).toBe("s3cret");
  });

  it("drops anything the visitor sent under those names", () => {
    const sent = { "x-client-ip": "6.6.6.6", "x-internal-proxy-secret": "guess", "x-forwarded-for": "203.0.113.9" };
    const out = withClientIp(headers(sent), undefined);
    expect(out.get("x-client-ip")).toBeNull();
    expect(out.get("x-internal-proxy-secret")).toBeNull();
    expect(withClientIp(headers(sent), "s3cret").get("x-client-ip")).toBe("203.0.113.9");
  });
});
