import { expect, test } from "@playwright/test";
import { tableLink, closeContexts } from "./helpers";

test.afterEach(async ({ browser }) => closeContexts(browser));

test("pages ship a strict, per-request Content-Security-Policy", async ({ page, browser }) => {
  const link = await tableLink(browser, 8);
  const violations: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to/.test(m.text()) && violations.push(m.text()));

  const res = await page.goto(`${link}/menu`);
  const csp = res!.headers()["content-security-policy"] ?? "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).toContain("frame-ancestors 'none'");
  await expect(page.getByRole("heading", { name: "Starters" })).toBeVisible();

  // Every script in the HTML carries this response's nonce …
  const scripts = await page.locator("script").evaluateAll((els) => els.map((s) => (s as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  for (const n of scripts) expect(n).toBe(nonce);

  // … a fresh one on every request …
  const again = await page.request.get(`${link}/menu`);
  expect(again.headers()["content-security-policy"]).not.toContain(`'nonce-${nonce}'`);

  // … and a typical XSS payload (HTML with an inline event handler) never runs.
  const ran = await page.evaluate(async () => {
    const div = document.createElement("div");
    div.innerHTML = `<img src="data:," onload="window.__injected = true" onerror="window.__injected = true">`;
    document.body.appendChild(div);
    await new Promise((r) => setTimeout(r, 300));
    return (window as unknown as { __injected?: boolean }).__injected === true;
  });
  expect(ran).toBe(false);
  // The only violation is the one we just provoked.
  expect(violations.filter((v) => !/inline event handler|script-src-attr/.test(v))).toEqual([]);

  const h = res!.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("same-origin");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("the API refuses cross-site writes and sends its own hardened headers", async ({ request }) => {
  const evil = await request.post("/api/auth/login", {
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    data: { email: "x@example.test", password: "whatever-long" },
  });
  expect(evil.status()).toBe(403);
  expect((await evil.json()).error.code).toBe("FORBIDDEN_ORIGIN");

  const health = await request.get("/api/health");
  expect(health.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect(health.headers()["x-powered-by"]).toBeUndefined();
});
