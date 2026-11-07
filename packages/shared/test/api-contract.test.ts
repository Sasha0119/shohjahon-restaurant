import { describe, expect, it } from "vitest";
import * as schemas from "../src/api/schemas";
import {
  addCartItemBody,
  createPaymentBody,
  createReviewBody,
  discountCodeInput,
  menuItemInput,
  modifierGroupInput,
  pinLoginBody,
  routes,
  rooms,
  staffInput,
  versionAction,
  zSelection,
} from "../src/api";

describe("route table", () => {
  it("has unique method + path pairs under /api", () => {
    const keys = routes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    routes.forEach((r) => expect(r.path.startsWith("/api/")).toBe(true));
  });

  it("only references schemas that exist", () => {
    for (const r of routes) {
      if (r.input) expect(schemas, `${r.method} ${r.path}`).toHaveProperty(r.input);
    }
  });

  it("protects every admin route with the manager role", () => {
    for (const r of routes.filter((r) => r.path.startsWith("/api/admin/"))) {
      expect(r.access, r.path).toEqual({ kind: "staff", roles: ["manager"] });
    }
  });

  it("requires a guest session for /api/session routes", () => {
    for (const r of routes.filter((r) => r.path.startsWith("/api/session"))) {
      expect(r.access.kind, r.path).toBe("guest");
    }
  });

  it("makes order submission and payments idempotent", () => {
    const find = (m: string, p: string) => routes.find((r) => r.method === m && r.path === p);
    expect(find("POST", "/api/session/orders")?.idempotent).toBe(true);
    expect(find("POST", "/api/session/payments")?.idempotent).toBe(true);
  });

  it("rate-limits every login route", () => {
    for (const r of routes.filter((r) => r.path.startsWith("/api/auth/") && r.access.kind === "public")) {
      expect(r.rateLimit, r.path).toBe("auth");
    }
  });

  it("never exposes a public write route except join, webhooks, receipt email and booking (and cancelling through its signed link)", () => {
    const allowed = [
      "/api/tables/:qrToken/join",
      "/api/payments/webhook/:provider",
      "/api/receipts/:publicToken/email",
      "/api/reservations",
      "/api/reservations/manage/:token/cancel",
    ];
    for (const r of routes.filter((r) => r.access.kind === "public" && r.method !== "GET")) {
      if (r.path.startsWith("/api/auth/")) continue;
      expect(allowed, `${r.method} ${r.path}`).toContain(r.path);
    }
  });

  it("assigns every route to a phase 3–9", () => {
    for (const r of routes) {
      expect(r.phase).toBeGreaterThanOrEqual(3);
      expect(r.phase).toBeLessThanOrEqual(9);
    }
  });
});

describe("request schemas", () => {
  it("validates cart additions", () => {
    expect(addCartItemBody.parse({ itemId: "item-x", quantity: 2 })).toEqual({
      itemId: "item-x",
      quantity: 2,
      selection: {},
    });
    expect(addCartItemBody.safeParse({ itemId: "item-x", quantity: 0 }).success).toBe(false);
    expect(addCartItemBody.safeParse({ itemId: "item-x", quantity: 1.5 }).success).toBe(false);
    expect(addCartItemBody.safeParse({ itemId: "../etc", quantity: 1 }).success).toBe(false);
    expect(addCartItemBody.safeParse({ itemId: "x", quantity: 1, note: "a".repeat(141) }).success).toBe(false);
  });

  it("caps selection size", () => {
    const big = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`g${i}`, ["o"]]));
    expect(zSelection.safeParse(big).success).toBe(false);
  });

  it("requires split details for the matching mode", () => {
    const base = { method: "card", amountCents: 1000 };
    expect(createPaymentBody.safeParse({ ...base, splitMode: "even" }).success).toBe(false);
    expect(createPaymentBody.safeParse({ ...base, splitMode: "even", people: 3 }).success).toBe(true);
    expect(createPaymentBody.safeParse({ ...base, splitMode: "items" }).success).toBe(false);
    expect(createPaymentBody.safeParse({ ...base, splitMode: "full" }).data?.tipCents).toBe(0);
    expect(createPaymentBody.safeParse({ ...base, splitMode: "full", amountCents: 0 }).success).toBe(false);
  });

  it("validates ratings and PINs", () => {
    expect(createReviewBody.safeParse({ rating: 6 }).success).toBe(false);
    expect(createReviewBody.parse({ rating: 5 }).comment).toBe("");
    expect(pinLoginBody.safeParse({ staffId: "s1", pin: "12a4" }).success).toBe(false);
    expect(pinLoginBody.safeParse({ staffId: "s1", pin: "1234" }).success).toBe(true);
  });

  it("validates modifier groups", () => {
    const opt = { name: "A" };
    expect(modifierGroupInput.safeParse({ name: "G", minSelect: 2, maxSelect: 1, options: [opt, opt] }).success).toBe(
      false,
    );
    expect(modifierGroupInput.safeParse({ name: "G", minSelect: 2, maxSelect: 2, options: [opt] }).success).toBe(false);
    expect(
      modifierGroupInput.safeParse({
        name: "G",
        minSelect: 0,
        maxSelect: 1,
        options: [
          { name: "A", isDefault: true },
          { name: "B", isDefault: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates menu items", () => {
    const ok = { slug: "new-dish", categoryId: "cat-1", name: "Dish", priceCents: 1200, imageUrl: "/images/x.jpg" };
    expect(menuItemInput.parse(ok).tags).toEqual([]);
    expect(menuItemInput.safeParse({ ...ok, slug: "New Dish" }).success).toBe(false);
    expect(menuItemInput.safeParse({ ...ok, tags: ["keto"] }).success).toBe(false);
    expect(menuItemInput.safeParse({ ...ok, priceCents: 12.5 }).success).toBe(false);
  });

  it("requires role-specific staff credentials", () => {
    expect(staffInput.safeParse({ role: "waiter", name: "A", pin: "1234" }).success).toBe(true);
    expect(staffInput.safeParse({ role: "waiter", name: "A" }).success).toBe(false);
    expect(staffInput.safeParse({ role: "manager", name: "A", email: "a@b.co", password: "short" }).success).toBe(
      false,
    );
    const m = staffInput.parse({ role: "manager", name: "A", email: "Boss@Example.COM", password: "long-enough-pw" });
    expect(m.role === "manager" && m.email).toBe("boss@example.com");
  });

  it("normalises and bounds discount codes", () => {
    expect(discountCodeInput.parse({ code: "summer10", kind: "percent", value: 10 }).code).toBe("SUMMER10");
    expect(discountCodeInput.safeParse({ code: "BIG", kind: "percent", value: 150 }).success).toBe(false);
    expect(discountCodeInput.safeParse({ code: "FIX", kind: "fixed", value: 2.5 }).success).toBe(false);
    expect(
      discountCodeInput.safeParse({
        code: "OLD",
        kind: "fixed",
        value: 500,
        startsAt: "2026-02-01",
        endsAt: "2026-01-01",
      }).success,
    ).toBe(false);
  });
});

describe("realtime", () => {
  it("decides between apply, ignore and resync", () => {
    expect(versionAction(5, 6)).toBe("apply");
    expect(versionAction(5, 5)).toBe("ignore");
    expect(versionAction(5, 3)).toBe("ignore");
    expect(versionAction(5, 8)).toBe("resync");
  });

  it("builds room names", () => {
    expect(rooms.session("abc")).toBe("session:abc");
    expect(rooms.kds("bar")).toBe("kds:bar");
  });
});

describe("closed-visit access", () => {
  it("only the review route accepts a guest whose visit has ended", () => {
    const allowed = routes.filter((r) => r.allowClosedSession).map((r) => `${r.method} ${r.path}`);
    expect(allowed).toEqual(["POST /api/session/review"]);
    for (const r of routes.filter((r) => r.allowClosedSession)) expect(r.access.kind).toBe("guest");
  });
});
