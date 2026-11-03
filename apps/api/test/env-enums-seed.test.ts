import { seedMenu } from "@app/shared/seed";
import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "../src/env.ts";
import { Allergen, CallType, DietaryTag, PaymentMethod } from "../src/generated/prisma/enums.ts";
import { enums, fromDbCamel, fromDbKebab, toDbEnum } from "../src/lib/enums.ts";
import { buildSeedPlan } from "../src/seed-plan.ts";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  CORS_ORIGINS: "http://localhost:3000",
  PUBLIC_WEB_URL: "http://localhost:3000",
  QR_TOKEN_SECRET: "a".repeat(40),
  COOKIE_SECRET: "b".repeat(40),
};

describe("parseEnv", () => {
  it("applies safe defaults", () => {
    const env = parseEnv(base);
    expect(env.API_PORT).toBe(4000);
    expect(env.PAYMENT_PROVIDER).toBe("mock");
    expect(env.SESSION_IDLE_MINUTES).toBe(120);
    expect(env.CALL_COOLDOWN_SECONDS).toBe(60);
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it("parses lists and booleans", () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: "http://a.test, https://b.test", COOKIE_SECURE: "true" });
    expect(env.CORS_ORIGINS).toEqual(["http://a.test", "https://b.test"]);
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it("reports every problem at once", () => {
    try {
      parseEnv({ QR_TOKEN_SECRET: "short" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const problems = (e as EnvError).problems.join("\n");
      expect(problems).toContain("DATABASE_URL");
      expect(problems).toContain("QR_TOKEN_SECRET");
      expect(problems).toContain("COOKIE_SECRET");
    }
  });

  it("treats empty strings as unset", () => {
    expect(parseEnv({ ...base, STRIPE_SECRET_KEY: "", SMTP_URL: "" }).SMTP_URL).toBeUndefined();
  });

  it("requires Stripe keys only for the Stripe provider", () => {
    expect(() => parseEnv({ ...base, PAYMENT_PROVIDER: "stripe" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() =>
      parseEnv({ ...base, PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh" }),
    ).not.toThrow();
  });

  it("rejects identical secrets", () => {
    expect(() => parseEnv({ ...base, COOKIE_SECRET: base.QR_TOKEN_SECRET })).toThrow(/differ/);
  });

  it("refuses unsafe production settings", () => {
    const prod = {
      ...base,
      NODE_ENV: "production",
      QR_TOKEN_SECRET: "change-me-qr-secret-at-least-32-characters-long",
    };
    const err = (() => {
      try {
        parseEnv(prod);
      } catch (e) {
        return (e as EnvError).problems.join("\n");
      }
      return "";
    })();
    expect(err).toContain("QR_TOKEN_SECRET: Still the example value");
    expect(err).toContain("COOKIE_SECURE");
    expect(err).toContain("PUBLIC_WEB_URL");

    expect(() =>
      parseEnv({ ...base, NODE_ENV: "production", COOKIE_SECURE: "true", PUBLIC_WEB_URL: "https://order.example.org" }),
    ).not.toThrow();
  });

  it("the shipped .env.example is valid for development", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    const vars = Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    expect(() => parseEnv(vars)).not.toThrow();
  });
});

describe("enum mapping", () => {
  it("round-trips every dietary tag and allergen", () => {
    for (const v of Object.values(DietaryTag)) expect(enums.tag.toDb(enums.tag.fromDb(v))).toBe(v);
    for (const v of Object.values(Allergen)) expect(enums.allergen.toDb(enums.allergen.fromDb(v))).toBe(v);
    expect(enums.tag.fromDb("GLUTEN_FREE")).toBe("gluten-free");
    expect(enums.allergen.fromDb("TREE_NUTS")).toBe("tree-nuts");
  });

  it("round-trips camelCase wire values", () => {
    for (const v of Object.values(PaymentMethod)) expect(enums.paymentMethod.toDb(enums.paymentMethod.fromDb(v))).toBe(v);
    for (const v of Object.values(CallType)) expect(enums.callType.toDb(enums.callType.fromDb(v))).toBe(v);
    expect(enums.paymentMethod.fromDb("APPLE_PAY")).toBe("applePay");
    expect(enums.callType.toDb("cashPayment")).toBe("CASH_PAYMENT");
  });

  it("has consistent primitive converters", () => {
    expect(toDbEnum("gluten-free")).toBe("GLUTEN_FREE");
    expect(toDbEnum("googlePay")).toBe("GOOGLE_PAY");
    expect(fromDbKebab("TREE_NUTS")).toBe("tree-nuts");
    expect(fromDbCamel("GOOGLE_PAY")).toBe("googlePay");
  });
});

describe("buildSeedPlan", () => {
  const plan = buildSeedPlan(seedMenu);

  it("maps the whole demo menu", () => {
    expect(plan.categories).toHaveLength(5);
    expect(plan.items).toHaveLength(25);
    expect(plan.tables).toHaveLength(12);
    expect(plan.combos).toHaveLength(2);
    expect(plan.suggestions.length).toBe(seedMenu.upsells.filter((u) => u.kind === "suggest").length);
    expect(plan.categories.find((c) => c.slug === "drinks")?.station).toBe("BAR");
  });

  it("produces globally unique, URL-safe modifier ids", () => {
    const ids = plan.items.flatMap((i) => i.groups.flatMap((g) => [g.id, ...g.options.map((o) => o.id)]));
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(id.length).toBeLessThanOrEqual(64);
    });
  });

  it("converts enums and keeps prices in cents", () => {
    const wings = plan.items.find((i) => i.slug === "smoky-chicken-wings")!;
    expect(wings.tags).toEqual(["HALAL", "GLUTEN_FREE", "SPICY"]);
    expect(wings.priceCents).toBe(1250);
    const prawns = plan.items.find((i) => i.slug === "garlic-prawn-spaghetti")!;
    expect(prawns.inStock).toBe(false);
    expect(prawns.allergens).toContain("CRUSTACEANS");
  });

  it("orders items within each category", () => {
    const starters = plan.items.filter((i) => i.categoryId === "cat-starters").map((i) => i.sortOrder);
    expect(starters).toEqual([0, 1, 2, 3, 4]);
  });

  it("converts time-based menu windows to minutes", () => {
    const menu = {
      ...seedMenu,
      categories: seedMenu.categories.map((c, i) =>
        i === 0 ? { ...c, availability: [{ days: ["sat" as const], from: "08:00", to: "11:30" }] } : c,
      ),
    };
    expect(buildSeedPlan(menu).categories[0]!.availability).toEqual([
      { days: ["SAT"], fromMinute: 480, toMinute: 690 },
    ]);
  });
});
