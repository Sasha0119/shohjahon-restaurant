/**
 * Seeds the database with the demo menu, 12 tables and staff accounts.
 * Safe to run more than once: everything is upserted by a stable key, and
 * existing passwords / PINs are never overwritten.
 *
 *   npm run db:seed -w @app/api
 */
import "dotenv/config";
import { seedMenu } from "@app/shared/seed";
import { hashSecret } from "../src/auth/hash.ts";
import { createPrisma } from "../src/db.ts";
import { buildSeedPlan } from "../src/seed-plan.ts";
import { createQrToken, guestTableUrl } from "../src/tables/qr-token.ts";

/** Local-testing PIN staff. Created only outside production when SEED_DEMO_STAFF=true. */
const DEMO_STAFF = [
  { id: "staff-demo-waiter", name: "Demo Waiter", role: "WAITER" as const, pin: "1234" },
  { id: "staff-demo-kitchen", name: "Demo Kitchen", role: "KITCHEN" as const, pin: "4321" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy apps/api/.env.example to apps/api/.env)");
  const isProd = process.env.NODE_ENV === "production";
  const db = createPrisma(url);
  const plan = buildSeedPlan(seedMenu);

  try {
    // Menu text contains accents and symbols (é, ñ, —): the database must be UTF-8.
    const [{ server_encoding: encoding } = { server_encoding: "?" }] =
      await db.$queryRaw<{ server_encoding: string }[]>`SHOW server_encoding`;
    if (encoding.toUpperCase() !== "UTF8") {
      throw new Error(
        `Database encoding is ${encoding}; it must be UTF8. Create it with: CREATE DATABASE … ENCODING 'UTF8' TEMPLATE template0;`,
      );
    }

    // ── Menu ────────────────────────────────────────────────────────────────
    for (const { availability, ...c } of plan.categories) {
      await db.category.upsert({ where: { id: c.id }, create: c, update: c });
      await db.categoryAvailability.deleteMany({ where: { categoryId: c.id } });
      if (availability.length) {
        await db.categoryAvailability.createMany({
          data: availability.map((w) => ({ ...w, categoryId: c.id })),
        });
      }
    }

    for (const { groups, ...item } of plan.items) {
      await db.menuItem.upsert({ where: { id: item.id }, create: item, update: item });
      for (const { options, ...g } of groups) {
        const group = { ...g, itemId: item.id };
        await db.modifierGroup.upsert({ where: { id: g.id }, create: group, update: group });
        for (const o of options) {
          const option = { ...o, groupId: g.id };
          await db.modifierOption.upsert({ where: { id: o.id }, create: option, update: option });
        }
      }
    }

    for (const s of plan.suggestions) {
      await db.upsellSuggestion.upsert({
        where: { itemId_suggestItemId: { itemId: s.itemId, suggestItemId: s.suggestItemId } },
        create: s,
        update: { sortOrder: s.sortOrder },
      });
    }

    for (const { itemIds, ...combo } of plan.combos) {
      await db.comboDeal.upsert({ where: { id: combo.id }, create: combo, update: combo });
      await db.comboDealItem.deleteMany({ where: { comboId: combo.id } });
      await db.comboDealItem.createMany({ data: itemIds.map((itemId) => ({ comboId: combo.id, itemId })) });
    }

    // ── Tables ──────────────────────────────────────────────────────────────
    for (const t of plan.tables) {
      await db.diningTable.upsert({ where: { number: t.number }, create: t, update: {} });
    }

    // ── Staff ───────────────────────────────────────────────────────────────
    const email = process.env.SEED_MANAGER_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_MANAGER_PASSWORD;
    if (email && password) {
      if (password.length < 10) throw new Error("SEED_MANAGER_PASSWORD must be at least 10 characters");
      if (isProd && /change-me/i.test(password)) throw new Error("Set a real SEED_MANAGER_PASSWORD in production");
      const existing = await db.staff.findUnique({ where: { email } });
      if (!existing) {
        await db.staff.create({
          data: { name: "Manager", role: "MANAGER", email, passwordHash: await hashSecret(password) },
        });
        console.log(`✓ Created manager ${email}`);
      } else {
        console.log(`• Manager ${email} already exists (password unchanged)`);
      }
    } else {
      console.log("• SEED_MANAGER_EMAIL / SEED_MANAGER_PASSWORD not set — no manager created");
    }

    if (!isProd && process.env.SEED_DEMO_STAFF === "true") {
      for (const s of DEMO_STAFF) {
        const exists = await db.staff.findUnique({ where: { id: s.id } });
        if (!exists) {
          await db.staff.create({ data: { id: s.id, name: s.name, role: s.role, pinHash: await hashSecret(s.pin) } });
        }
      }
      console.log("✓ Demo PIN staff ready (see DEMO_STAFF in apps/api/prisma/seed.ts)");
    }

    // Handy for local testing: signed guest links (same as the printed QR codes).
    const secret = process.env.QR_TOKEN_SECRET;
    const webUrl = process.env.PUBLIC_WEB_URL;
    if (!isProd && secret && secret.length >= 32 && webUrl) {
      const tables = await db.diningTable.findMany({ where: { number: { lte: 3 } }, orderBy: { number: "asc" } });
      console.log("Guest links (dev):");
      for (const t of tables) {
        console.log(`  Table ${t.number}: ${guestTableUrl(webUrl, createQrToken(secret, t.id, t.qrVersion))}`);
      }
    }

    console.log(
      `✓ Seeded ${plan.categories.length} categories, ${plan.items.length} items, ` +
        `${plan.suggestions.length} suggestions, ${plan.combos.length} combos, ${plan.tables.length} tables`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
