/**
 * Schema rules against a real PostgreSQL (see helpers/test-db.ts).
 *   TEST_DATABASE_URL=postgresql://user:pass@host:5432/postgres npm test
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, createTestDb, type TestDb } from "./helpers/test-db.ts";

const apiDir = fileURLToPath(new URL("..", import.meta.url));

describe.skipIf(!TEST_DATABASE_URL)("database schema (integration)", () => {
  let t: TestDb;
  let db: Db;

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    // This file checks the real demo seed: drop the test fixture menu, then seed
    // twice — seeding a second time must be harmless.
    await db.$transaction([db.menuItem.deleteMany(), db.comboDeal.deleteMany(), db.category.deleteMany()]);
    const seed = () =>
      execSync("npx tsx prisma/seed.ts", {
        cwd: apiDir,
        env: {
          ...process.env,
          DATABASE_URL: t.url,
          SEED_DEMO_STAFF: "true",
          SEED_MANAGER_EMAIL: TEST_MANAGER.email,
          SEED_MANAGER_PASSWORD: TEST_MANAGER.password,
        },
        stdio: "pipe",
      });
    seed();
    seed();
  }, 180_000);

  afterAll(async () => {
    await t?.cleanup();
  });

  it("seeds the demo data exactly once", async () => {
    expect(await db.category.count()).toBe(5);
    expect(await db.menuItem.count()).toBe(25);
    expect(await db.diningTable.count()).toBe(12);
    expect(await db.comboDealItem.count()).toBe(6);
    expect(await db.staff.count({ where: { role: "MANAGER" } })).toBe(1);
    const shashlik = await db.menuItem.findUniqueOrThrow({
      where: { slug: "lamb-shashlik" },
      include: { modifierGroups: { include: { options: true }, orderBy: { sortOrder: "asc" } } },
    });
    expect(shashlik.tags).toEqual(["HALAL", "GLUTEN_FREE"]);
    expect(shashlik.priceCents).toBe(79_000); // whole so'm
    expect(shashlik.modifierGroups.map((g) => g.options.length)).toEqual([2, 1]);
    // Uzbek in the plain columns, English and Russian stored alongside (UTF-8 intact).
    expect(shashlik.name).toBe("Qoʻy goʻshtidan shashlik");
    expect(shashlik.translations).toMatchObject({ en: { name: "Lamb shashlik" }, ru: { name: "Шашлык из баранины" } });
    expect(shashlik.modifierGroups[0]!.translations).toMatchObject({ ru: { name: "Порция" } });
  });

  it("allows only one OPEN session per table", async () => {
    const table = await db.diningTable.findUniqueOrThrow({ where: { number: 1 } });
    await db.tableSession.create({ data: { tableId: table.id } });
    await expect(db.tableSession.create({ data: { tableId: table.id } })).rejects.toThrow();
    // A closed session doesn't block a new one.
    await db.tableSession.updateMany({ where: { tableId: table.id }, data: { status: "CLOSED" } });
    await expect(db.tableSession.create({ data: { tableId: table.id } })).resolves.toBeTruthy();
  });

  it("rejects invalid data at the database level", async () => {
    const item = await db.menuItem.findFirstOrThrow();
    await expect(db.menuItem.update({ where: { id: item.id }, data: { priceCents: -1 } })).rejects.toThrow();
    await expect(
      db.staff.create({ data: { name: "No PIN", role: "WAITER" } }),
    ).rejects.toThrow();
    await expect(
      db.staff.create({ data: { name: "No pw", role: "MANAGER", email: "x@example.com" } }),
    ).rejects.toThrow();
    await expect(
      db.discountCode.create({ data: { code: "TOOMUCH", kind: "PERCENT", value: 20_000 } }),
    ).rejects.toThrow();
  });

  it("enforces quantity, rating and idempotency rules", async () => {
    const table = await db.diningTable.findUniqueOrThrow({ where: { number: 2 } });
    const session = await db.tableSession.create({ data: { tableId: table.id } });
    const guest = await db.sessionGuest.create({ data: { sessionId: session.id, tokenHash: "hash-1" } });
    const item = await db.menuItem.findFirstOrThrow();

    await expect(
      db.cartItem.create({ data: { sessionId: session.id, itemId: item.id, guestId: guest.id, quantity: 0 } }),
    ).rejects.toThrow();
    await expect(db.review.create({ data: { sessionId: session.id, guestId: guest.id, rating: 0 } })).rejects.toThrow();

    const payment = {
      sessionId: session.id,
      amountCents: 1000,
      method: "CARD" as const,
      splitMode: "FULL" as const,
      provider: "mock",
      idempotencyKey: "same-key-1234567890",
    };
    await db.payment.create({ data: payment });
    await expect(db.payment.create({ data: payment })).rejects.toThrow();

    await db.order.create({ data: { sessionId: session.id, round: 1, station: "KITCHEN" } });
    await db.order.create({ data: { sessionId: session.id, round: 1, station: "BAR" } });
    await expect(db.order.create({ data: { sessionId: session.id, round: 1, station: "BAR" } })).rejects.toThrow();
  });

  it("refuses to delete a menu item that appears on an order", async () => {
    const table = await db.diningTable.findUniqueOrThrow({ where: { number: 3 } });
    const session = await db.tableSession.create({ data: { tableId: table.id } });
    const item = await db.menuItem.findFirstOrThrow({ where: { slug: "cappuccino" } });
    await db.order.create({
      data: {
        sessionId: session.id,
        round: 1,
        station: "BAR",
        items: { create: { itemId: item.id, name: item.name, unitPriceCents: item.priceCents, quantity: 1 } },
      },
    });
    await expect(db.menuItem.delete({ where: { id: item.id } })).rejects.toThrow();
  });
});
