import { describe, expect, it } from "vitest";
import { STATIC_SECURITY_HEADERS, buildCsp, createNonce } from "../src/lib/security-headers";

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
