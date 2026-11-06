import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brand } from "@app/config";
import { WEEKDAYS, localParts } from "@app/shared";
import type { AdminMenuDTO, MenuDTO } from "@app/shared/api";
import { pino } from "pino";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { Db } from "../src/db.ts";
import { parseEnv } from "../src/env.ts";
import { createRecordingRealtime } from "../src/realtime/types.ts";
import { TEST_DATABASE_URL, TEST_MANAGER, TEST_PIN_STAFF, createTestDb, type TestDb } from "./helpers/test-db.ts";

const ORIGIN = "http://localhost:3000";

describe.skipIf(!TEST_DATABASE_URL)("menu & menu management (integration)", () => {
  let t: TestDb;
  let db: Db;
  let app: ReturnType<typeof createApp>["app"];
  let uploadDir: string;
  let manager = "";
  const realtime = createRecordingRealtime();

  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
    uploadDir = await mkdtemp(path.join(os.tmpdir(), "menu-uploads-"));
    const env = parseEnv({
      DATABASE_URL: t.url,
      CORS_ORIGINS: ORIGIN,
      PUBLIC_WEB_URL: ORIGIN,
      QR_TOKEN_SECRET: "q".repeat(40),
      COOKIE_SECRET: "c".repeat(40),
      UPLOAD_DIR: uploadDir,
      MAX_UPLOAD_MB: "1",
    });
    app = createApp({ db, env, logger: pino({ level: "silent" }), realtime, disableRateLimits: true }).app;
    const res = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send(TEST_MANAGER);
    manager = (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  }, 180_000);

  afterAll(async () => {
    await t?.cleanup();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  const asManager = {
    get: (p: string) => request(app).get(p).set("Cookie", manager),
    post: (p: string, body?: object) => request(app).post(p).set("Origin", ORIGIN).set("Cookie", manager).send(body),
    put: (p: string, body: object) => request(app).put(p).set("Origin", ORIGIN).set("Cookie", manager).send(body),
    del: (p: string) => request(app).delete(p).set("Origin", ORIGIN).set("Cookie", manager),
  };
  const publicMenu = async () => (await request(app).get("/api/menu")).body as MenuDTO;
  const adminMenu = async () => (await asManager.get("/api/admin/menu")).body as AdminMenuDTO;
  const lastEvent = () => realtime.events.at(-1);

  describe("public menu", () => {
    it("serves the seeded menu with wire-format enums and cents", async () => {
      const menu = await publicMenu();
      expect(menu.categories.map((c) => c.slug)).toEqual(["starters", "mains", "pizza-pasta", "desserts", "drinks"]);
      expect(menu.items).toHaveLength(25);
      const wings = menu.items.find((i) => i.slug === "smoky-chicken-wings")!;
      expect(wings).toMatchObject({ priceCents: 1250, tags: ["halal", "gluten-free", "spicy"] });
      expect(wings.modifierGroups.map((g) => g.name)).toEqual(["Portion", "Heat level"]);
      expect(menu.items.find((i) => i.slug === "garlic-prawn-spaghetti")!.inStock).toBe(false);
      expect(menu.suggestions.length).toBeGreaterThan(10);
      expect(menu.combos).toHaveLength(2);
      expect(menu.categories.find((c) => c.slug === "drinks")!.station).toBe("bar");
    });

    it("supports conditional requests (304 when unchanged)", async () => {
      const first = await request(app).get("/api/menu");
      const etag = first.headers.etag!;
      expect(first.headers["cache-control"]).toContain("must-revalidate");
      const again = await request(app).get("/api/menu").set("If-None-Match", etag);
      expect(again.status).toBe(304);
    });

    it("needs no login", async () => {
      expect((await request(app).get("/api/menu")).status).toBe(200);
    });
  });

  describe("categories", () => {
    it("hides a category outside its time window (in the restaurant's time zone)", async () => {
      const drinks = (await adminMenu()).categories.find((c) => c.slug === "drinks")!;
      const today = localParts(new Date(), brand.timezone).dayIdx;
      const otherDay = WEEKDAYS[(today + 3) % 7]!;
      const body = { slug: "drinks", name: "Drinks", station: "bar", sortOrder: drinks.sortOrder };

      expect(
        (
          await asManager.put(`/api/admin/categories/${drinks.id}`, {
            ...body,
            availability: [{ days: [otherDay], from: "00:00", to: "23:59" }],
          })
        ).status,
      ).toBe(200);
      let menu = await publicMenu();
      expect(menu.categories.some((c) => c.slug === "drinks")).toBe(false);
      expect(menu.items.some((i) => i.categoryId === drinks.id)).toBe(false);
      // Suggestions pointing at hidden drinks disappear too.
      const visible = new Set(menu.items.map((i) => i.id));
      expect(menu.suggestions.every((s) => visible.has(s.suggestItemId))).toBe(true);
      expect(menu.combos.map((c) => c.name)).not.toContain("Coffee & tiramisu");

      // The manager still sees it, with its window.
      const admin = (await adminMenu()).categories.find((c) => c.id === drinks.id)!;
      expect(admin.availability).toEqual([{ days: [otherDay], from: "00:00", to: "23:59" }]);

      await asManager.put(`/api/admin/categories/${drinks.id}`, { ...body, availability: [] });
      menu = await publicMenu();
      expect(menu.categories.some((c) => c.slug === "drinks")).toBe(true);
    });

    it("creates, hides and deletes categories", async () => {
      const res = await asManager.post("/api/admin/categories", {
        slug: "specials",
        name: "Specials",
        station: "kitchen",
        sortOrder: 9,
      });
      expect(res.status).toBe(201);
      expect(lastEvent()).toMatchObject({ rooms: ["everyone"], event: "menu:updated" });
      expect((await publicMenu()).categories.at(-1)!.slug).toBe("specials");

      await asManager.put(`/api/admin/categories/${res.body.id}`, {
        slug: "specials",
        name: "Specials",
        station: "kitchen",
        active: false,
      });
      expect((await publicMenu()).categories.some((c) => c.slug === "specials")).toBe(false);

      expect(
        (await asManager.post("/api/admin/categories", { slug: "specials", name: "Again", station: "bar" })).body.error
          .code,
      ).toBe("SLUG_TAKEN");
      expect((await asManager.del(`/api/admin/categories/${res.body.id}`)).status).toBe(204);
    });

    it("refuses to delete a category that still has items", async () => {
      const mains = (await adminMenu()).categories.find((c) => c.slug === "mains")!;
      const res = await asManager.del(`/api/admin/categories/${mains.id}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CATEGORY_NOT_EMPTY");
    });

    it("reorders categories and items", async () => {
      const before = (await adminMenu()).categories.map((c) => c.id);
      const reversed = [...before].reverse();
      expect((await asManager.put("/api/admin/menu/order", { categoryIds: reversed })).status).toBe(200);
      expect((await adminMenu()).categories.map((c) => c.id)).toEqual(reversed);
      await asManager.put("/api/admin/menu/order", { categoryIds: before });

      const starters = (await adminMenu()).items.filter((i) => i.categoryId === "cat-starters").map((i) => i.id);
      const swapped = [starters[1]!, starters[0]!, ...starters.slice(2)];
      await asManager.put("/api/admin/menu/order", { items: { categoryId: "cat-starters", itemIds: swapped } });
      expect((await publicMenu()).items.filter((i) => i.categoryId === "cat-starters").map((i) => i.id)).toEqual(
        swapped,
      );

      const wrong = await asManager.put("/api/admin/menu/order", {
        items: { categoryId: "cat-mains", itemIds: swapped },
      });
      expect(wrong.body.error.code).toBe("UNKNOWN_ITEM");
    });
  });

  describe("items", () => {
    const baseItem = {
      slug: "lemon-tart",
      categoryId: "cat-desserts",
      name: "Lemon Tart",
      description: "Sharp lemon curd, buttery pastry.",
      priceCents: 750,
      imageUrl: "/images/menu/classic-tiramisu.jpg",
      tags: ["vegetarian"],
      allergens: ["gluten", "eggs", "milk"],
      modifierGroups: [
        {
          name: "Serve with",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: "Cream", isDefault: true },
            { name: "Ice cream", priceDeltaCents: 200 },
          ],
        },
      ],
    };
    let itemId = "";

    it("creates an item with modifier groups", async () => {
      const res = await asManager.post("/api/admin/items", baseItem);
      expect(res.status).toBe(201);
      itemId = res.body.id;
      const item = (await publicMenu()).items.find((i) => i.id === itemId)!;
      expect(item).toMatchObject({ name: "Lemon Tart", priceCents: 750, tags: ["vegetarian"], imageAlt: "Lemon Tart" });
      expect(item.modifierGroups[0]!.options.map((o) => [o.name, o.priceDeltaCents, o.isDefault])).toEqual([
        ["Cream", 0, true],
        ["Ice cream", 200, false],
      ]);
    });

    it("updates in place: keeps known option ids, adds new ones, removes missing ones", async () => {
      const current = (await adminMenu()).items.find((i) => i.id === itemId)!;
      const group = current.modifierGroups[0]!;
      const [cream] = group.options;
      const res = await asManager.put(`/api/admin/items/${itemId}`, {
        ...baseItem,
        priceCents: 800,
        modifierGroups: [
          {
            id: group.id,
            name: "Serve with",
            minSelect: 1,
            maxSelect: 1,
            options: [
              { ...cream, name: "Fresh cream" },
              { name: "Raspberry coulis", priceDeltaCents: 100 },
            ],
          },
          {
            name: "Make it a pair",
            minSelect: 0,
            maxSelect: 1,
            options: [{ name: "Second slice", priceDeltaCents: 600 }],
          },
        ],
      });
      expect(res.status).toBe(200);
      const after = (await adminMenu()).items.find((i) => i.id === itemId)!;
      expect(after.priceCents).toBe(800);
      expect(after.modifierGroups.map((g) => g.name)).toEqual(["Serve with", "Make it a pair"]);
      expect(after.modifierGroups[0]!.id).toBe(group.id);
      expect(after.modifierGroups[0]!.options.map((o) => o.name)).toEqual(["Fresh cream", "Raspberry coulis"]);
      expect(after.modifierGroups[0]!.options[0]!.id).toBe(cream!.id);
      expect(await db.modifierOption.count({ where: { name: "Ice cream", groupId: group.id } })).toBe(0);
    });

    it("hides inactive options from guests and drops empty groups", async () => {
      const current = (await adminMenu()).items.find((i) => i.id === itemId)!;
      await asManager.put(`/api/admin/items/${itemId}`, {
        ...baseItem,
        modifierGroups: current.modifierGroups.map((g, gi) => ({
          ...g,
          options: g.options.map((o) => ({ ...o, active: gi === 0 ? o.name === "Fresh cream" : false })),
        })),
      });
      const item = (await publicMenu()).items.find((i) => i.id === itemId)!;
      expect(item.modifierGroups).toHaveLength(1);
      expect(item.modifierGroups[0]!.options.map((o) => o.name)).toEqual(["Fresh cream"]);
    });

    it("marks items sold out and archives them", async () => {
      const current = (await adminMenu()).items.find((i) => i.id === itemId)!;
      await asManager.put(`/api/admin/items/${itemId}`, { ...current, categoryId: current.categoryId, inStock: false });
      expect((await publicMenu()).items.find((i) => i.id === itemId)!.inStock).toBe(false);

      expect((await asManager.del(`/api/admin/items/${itemId}`)).status).toBe(204);
      expect((await publicMenu()).items.some((i) => i.id === itemId)).toBe(false);
      expect((await adminMenu()).items.find((i) => i.id === itemId)!.archived).toBe(true);
      expect(await db.menuItem.count({ where: { id: itemId } })).toBe(1); // kept for order history
    });

    it("stores dish, option and category texts in other languages", async () => {
      const res = await asManager.post("/api/admin/items", {
        ...baseItem,
        slug: "osh-test",
        name: "Toshkent oshi",
        translations: {
          en: { name: "Tashkent plov", description: "Slow-steamed rice." },
          ru: { name: "Ташкентский плов", description: "" },
        },
        modifierGroups: [
          {
            name: "Qoʻshimcha",
            translations: { ru: { name: "Добавить" } },
            minSelect: 0,
            maxSelect: 1,
            options: [{ name: "Qazi", translations: { en: { name: "Horse sausage" } }, priceDeltaCents: 35_000 }],
          },
        ],
      });
      expect(res.status).toBe(201);
      const item = (await publicMenu()).items.find((i) => i.id === res.body.id)!;
      expect(item.name).toBe("Toshkent oshi");
      // Empty strings are dropped, so a blank Russian description falls back to the default language.
      expect(item.translations).toEqual({
        en: { name: "Tashkent plov", description: "Slow-steamed rice." },
        ru: { name: "Ташкентский плов" },
      });
      expect(item.modifierGroups[0]!.translations).toEqual({ ru: { name: "Добавить" } });
      expect(item.modifierGroups[0]!.options[0]!.translations).toEqual({ en: { name: "Horse sausage" } });
      expect((await adminMenu()).items.find((i) => i.id === res.body.id)!.translations.en?.name).toBe("Tashkent plov");

      const cat = (await adminMenu()).categories.find((c) => c.id === "cat-desserts")!;
      await asManager.put(`/api/admin/categories/${cat.id}`, {
        slug: cat.slug,
        name: cat.name,
        station: cat.station,
        availability: [],
        translations: { ru: { name: "Сладкое" } },
      });
      expect((await publicMenu()).categories.find((c) => c.id === cat.id)!.translations).toEqual({
        ru: { name: "Сладкое" },
      });

      // Only 2-letter language codes and known fields are accepted.
      const bad = await asManager.post("/api/admin/items", {
        ...baseItem,
        slug: "osh-bad",
        translations: { english: { name: "x" } },
      });
      expect(bad.status).toBe(400);
      const extra = await asManager.post("/api/admin/items", {
        ...baseItem,
        slug: "osh-bad2",
        translations: { en: { price: "1" } },
      });
      expect(extra.status).toBe(400);
    });

    it("validates input", async () => {
      expect((await asManager.post("/api/admin/items", { ...baseItem, slug: "lemon-tart" })).body.error.code).toBe(
        "SLUG_TAKEN",
      );
      expect(
        (await asManager.post("/api/admin/items", { ...baseItem, slug: "x1", categoryId: "nope" })).body.error.code,
      ).toBe("UNKNOWN_CATEGORY");
      const bad = await asManager.post("/api/admin/items", {
        ...baseItem,
        slug: "x2",
        imageUrl: "https://tracker.example/x.jpg",
      });
      expect(bad.status).toBe(400);
      expect(bad.body.error.details[0].path).toBe("imageUrl");
    });
  });

  describe("upsells & combos", () => {
    it("adds and removes suggestions", async () => {
      const res = await asManager.post("/api/admin/upsells", {
        itemId: "item-flat-white",
        suggestItemId: "item-fudge-brownie",
      });
      expect(res.status).toBe(201);
      expect((await publicMenu()).suggestions).toContainEqual({
        itemId: "item-flat-white",
        suggestItemId: "item-fudge-brownie",
      });
      const dup = await asManager.post("/api/admin/upsells", {
        itemId: "item-flat-white",
        suggestItemId: "item-fudge-brownie",
      });
      expect(dup.body.error.code).toBe("SUGGESTION_EXISTS");
      expect(
        (await asManager.post("/api/admin/upsells", { itemId: "item-flat-white", suggestItemId: "item-flat-white" }))
          .status,
      ).toBe(400);
      expect((await asManager.del(`/api/admin/upsells/${res.body.id}`)).status).toBe(204);
    });

    it("creates, edits and deletes combo deals", async () => {
      const res = await asManager.post("/api/admin/combos", {
        name: "Pizza night",
        discountCents: 250,
        itemIds: ["item-margherita-pizza", "item-mint-lime-cooler"],
      });
      expect(res.status).toBe(201);
      expect((await publicMenu()).combos.find((c) => c.id === res.body.id)).toMatchObject({
        name: "Pizza night",
        discountCents: 250,
      });

      await asManager.put(`/api/admin/combos/${res.body.id}`, {
        name: "Pizza night",
        discountCents: 300,
        itemIds: ["item-margherita-pizza", "item-house-iced-tea"],
        active: false,
      });
      expect((await publicMenu()).combos.some((c) => c.id === res.body.id)).toBe(false);

      const bad = await asManager.post("/api/admin/combos", {
        name: "Bad",
        discountCents: 100,
        itemIds: ["item-flat-white", "nope"],
      });
      expect(bad.body.error.code).toBe("UNKNOWN_ITEM");
      expect((await asManager.del(`/api/admin/combos/${res.body.id}`)).status).toBe(204);
    });
  });

  describe("photo uploads", () => {
    const upload = (buf: Buffer, name = "photo.png", cookie = manager) =>
      request(app)
        .post("/api/admin/uploads/images")
        .set("Origin", ORIGIN)
        .set("Cookie", cookie)
        .attach("image", buf, name);

    it("re-encodes to WebP, strips metadata, resizes and serves the file", async () => {
      const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#c0573a" } })
        .jpeg()
        .withMetadata({ exif: { IFD0: { Artist: "Secret Person", Copyright: "GPS somewhere" } } })
        .toBuffer();
      const res = await upload(big, "dish.jpg");
      expect(res.status).toBe(201);
      expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f]{32}\.webp$/);
      expect([res.body.width, res.body.height]).toEqual([1600, 1067]);

      const served = await request(app)
        .get(res.body.url)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toBe("image/webp");
      expect(served.headers["cache-control"]).toContain("immutable");
      const meta = await sharp(served.body as Buffer).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();

      // The URL is accepted by the item schema.
      const ok = await asManager.post("/api/admin/items", {
        slug: "uploaded-dish",
        categoryId: "cat-mains",
        name: "Uploaded dish",
        priceCents: 1000,
        imageUrl: res.body.url,
      });
      expect(ok.status).toBe(201);
    });

    it("rejects files that aren't images, tiny images and oversize files", async () => {
      const fake = await upload(Buffer.from("<script>alert(1)</script>"), "evil.png");
      expect(fake.status).toBe(415);
      const tiny = await upload(
        await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } })
          .png()
          .toBuffer(),
      );
      expect(tiny.body.error.code).toBe("IMAGE_TOO_SMALL");
      const huge = await upload(Buffer.alloc(1_200_000, 1), "huge.png");
      expect(huge.status).toBe(413);
      // Nothing was written for the rejected files.
      expect((await readdir(uploadDir)).filter((f) => f.endsWith(".webp"))).toHaveLength(1);
    });

    it("is manager-only and blocks cross-site uploads", async () => {
      const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#fff" } })
        .png()
        .toBuffer();
      const waiterRes = await request(app)
        .post("/api/auth/pin")
        .set("Origin", ORIGIN)
        .send({ staffId: TEST_PIN_STAFF.waiter.id, pin: TEST_PIN_STAFF.waiter.pin });
      const waiter = (waiterRes.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
      expect((await upload(png, "x.png", waiter)).status).toBe(403);
      const evil = await request(app)
        .post("/api/admin/uploads/images")
        .set("Origin", "https://evil.example")
        .set("Cookie", manager)
        .attach("image", png, "x.png");
      expect(evil.status).toBe(403);
      // Multipart is accepted on the upload endpoint only.
      const elsewhere = await request(app)
        .post("/api/admin/categories")
        .set("Origin", ORIGIN)
        .set("Cookie", manager)
        .attach("image", png, "x.png");
      expect(elsewhere.body.error.code).toBe("FORBIDDEN_ORIGIN");
    });

    it("IMAGE_STORE=database keeps photos in Postgres, not on disk", async () => {
      const env = parseEnv({
        DATABASE_URL: t.url,
        CORS_ORIGINS: ORIGIN,
        PUBLIC_WEB_URL: ORIGIN,
        QR_TOKEN_SECRET: "q".repeat(40),
        COOKIE_SECRET: "c".repeat(40),
        UPLOAD_DIR: uploadDir,
        IMAGE_STORE: "database",
      });
      const dbApp = createApp({ db, env, logger: pino({ level: "silent" }), realtime, disableRateLimits: true }).app;
      const before = (await readdir(uploadDir)).length;
      const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#1a6" } })
        .png()
        .toBuffer();
      const res = await request(dbApp)
        .post("/api/admin/uploads/images")
        .set("Origin", ORIGIN)
        .set("Cookie", manager)
        .attach("image", png, "db.png");
      expect(res.status).toBe(201);
      expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f]{32}\.webp$/);
      expect((await readdir(uploadDir)).length).toBe(before);
      expect(await db.storedImage.count()).toBe(1);

      const served = await request(dbApp)
        .get(res.body.url)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toBe("image/webp");
      expect(served.headers["cache-control"]).toContain("immutable");
      expect((await sharp(served.body as Buffer).metadata()).width).toBe(400);

      expect((await request(dbApp).get("/uploads/" + "0".repeat(32) + ".webp")).status).toBe(404);
      expect((await request(dbApp).get("/uploads/..%2Fsecret")).status).toBe(404);
    });
  });
});
