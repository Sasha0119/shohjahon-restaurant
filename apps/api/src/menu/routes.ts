import {
  categoryInput,
  comboDealInput,
  menuItemInput,
  menuOrderInput,
  rooms,
  upsellSuggestionInput,
  zId,
} from "@app/shared/api";
import type { Request } from "express";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { errors, parse } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import type { Realtime } from "../realtime/types.ts";
import { buildAdminMenu, buildPublicMenu } from "./read.ts";
import { saveCategory, saveCombo, saveItem } from "./write.ts";

type On = ReturnType<typeof createRegistrar>["on"];

const unique = (code: string, message: string) => (e: unknown) => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw errors.conflict(code, message);
  throw e;
};

export function registerMenuRoutes(on: On, db: Db, realtime: Realtime) {
  /** Tell every connected phone/screen to refetch the menu. */
  const changed = () => realtime.emit(rooms.everyone, "menu:updated", { menuVersion: Date.now().toString(36) });

  const record = (req: Request, action: string, entityType: string, entityId: string, data?: Prisma.InputJsonValue) =>
    audit(db, { actor: { type: "staff", staffId: req.staff!.id }, action, entityType, entityId, data, ip: req.ip });

  const requireRow = async <T>(p: Promise<T | null>, what: string): Promise<T> => {
    const row = await p;
    if (!row) throw errors.notFound(what);
    return row;
  };

  // ── public ────────────────────────────────────────────────────────────────
  on("GET", "/api/menu", async (req, res) => {
    const menu = await buildPublicMenu(db);
    const etag = `W/"${menu.version}"`;
    // Always revalidate (time-based menus and stock change), but a 304 costs almost nothing.
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) return void res.status(304).end();
    res.json(menu);
  });

  // ── admin: read ───────────────────────────────────────────────────────────
  on("GET", "/api/admin/menu", async (_req, res) => {
    res.json(await buildAdminMenu(db));
  });

  // ── categories ────────────────────────────────────────────────────────────
  on("POST", "/api/admin/categories", async (req, res) => {
    const input = parse(categoryInput, req.body);
    const id = await db
      .$transaction((tx) => saveCategory(tx, null, input))
      .catch(unique("SLUG_TAKEN", "Another category already uses this link name."));
    await record(req, "category.created", "category", id, { name: input.name });
    changed();
    res.status(201).json({ id });
  });

  on("PUT", "/api/admin/categories/:categoryId", async (req, res) => {
    const id = parse(zId, req.params.categoryId);
    await requireRow(db.category.findUnique({ where: { id } }), "Category");
    const input = parse(categoryInput, req.body);
    await db
      .$transaction((tx) => saveCategory(tx, id, input))
      .catch(unique("SLUG_TAKEN", "Another category already uses this link name."));
    await record(req, "category.updated", "category", id, { name: input.name, active: input.active });
    changed();
    res.json({ id });
  });

  on("DELETE", "/api/admin/categories/:categoryId", async (req, res) => {
    const id = parse(zId, req.params.categoryId);
    await requireRow(db.category.findUnique({ where: { id } }), "Category");
    if ((await db.menuItem.count({ where: { categoryId: id } })) > 0) {
      throw errors.conflict("CATEGORY_NOT_EMPTY", "This category still has items. Hide it instead, or move its items first.");
    }
    await db.category.delete({ where: { id } });
    await record(req, "category.deleted", "category", id);
    changed();
    res.status(204).end();
  });

  // ── items ─────────────────────────────────────────────────────────────────
  on("POST", "/api/admin/items", async (req, res) => {
    const input = parse(menuItemInput, req.body);
    const id = await db
      .$transaction((tx) => saveItem(tx, null, input))
      .catch(unique("SLUG_TAKEN", "Another item already uses this link name."));
    await record(req, "menu_item.created", "menu_item", id, { name: input.name, priceCents: input.priceCents });
    changed();
    res.status(201).json({ id });
  });

  on("PUT", "/api/admin/items/:itemId", async (req, res) => {
    const id = parse(zId, req.params.itemId);
    const before = await requireRow(db.menuItem.findUnique({ where: { id } }), "Item");
    const input = parse(menuItemInput, req.body);
    await db
      .$transaction((tx) => saveItem(tx, id, input))
      .catch(unique("SLUG_TAKEN", "Another item already uses this link name."));
    await record(req, "menu_item.updated", "menu_item", id, {
      name: input.name,
      priceCents: { from: before.priceCents, to: input.priceCents },
      inStock: input.inStock,
      archived: input.archived,
    });
    changed();
    res.json({ id });
  });

  on("DELETE", "/api/admin/items/:itemId", async (req, res) => {
    const id = parse(zId, req.params.itemId);
    await requireRow(db.menuItem.findUnique({ where: { id } }), "Item");
    await db.menuItem.update({ where: { id }, data: { archived: true, featured: false } });
    await record(req, "menu_item.archived", "menu_item", id);
    changed();
    res.status(204).end();
  });

  on("PUT", "/api/admin/menu/order", async (req, res) => {
    const input = parse(menuOrderInput, req.body);
    await db.$transaction(async (tx) => {
      if (input.categoryIds) {
        const found = await tx.category.count({ where: { id: { in: input.categoryIds } } });
        if (found !== input.categoryIds.length) throw errors.badRequest("UNKNOWN_CATEGORY", "Unknown category in the list.");
        for (const [i, id] of input.categoryIds.entries()) {
          await tx.category.update({ where: { id }, data: { sortOrder: i } });
        }
      }
      if (input.items) {
        const { categoryId, itemIds } = input.items;
        const found = await tx.menuItem.count({ where: { id: { in: itemIds }, categoryId } });
        if (found !== itemIds.length) throw errors.badRequest("UNKNOWN_ITEM", "Every item must belong to that category.");
        for (const [i, id] of itemIds.entries()) {
          await tx.menuItem.update({ where: { id }, data: { sortOrder: i } });
        }
      }
    });
    await record(req, "menu.reordered", "menu", "menu", input as Prisma.InputJsonValue);
    changed();
    res.json({ ok: true });
  });

  // ── upsell suggestions ────────────────────────────────────────────────────
  on("POST", "/api/admin/upsells", async (req, res) => {
    const input = parse(upsellSuggestionInput, req.body);
    const found = await db.menuItem.count({ where: { id: { in: [input.itemId, input.suggestItemId] } } });
    if (found !== 2) throw errors.badRequest("UNKNOWN_ITEM", "Both items must exist.");
    const count = await db.upsellSuggestion.count({ where: { itemId: input.itemId } });
    const s = await db.upsellSuggestion
      .create({ data: { ...input, sortOrder: count } })
      .catch(unique("SUGGESTION_EXISTS", "That suggestion already exists."));
    await record(req, "upsell.created", "upsell", s.id, input);
    changed();
    res.status(201).json({ id: s.id });
  });

  on("DELETE", "/api/admin/upsells/:upsellId", async (req, res) => {
    const id = parse(zId, req.params.upsellId);
    await requireRow(db.upsellSuggestion.findUnique({ where: { id } }), "Suggestion");
    await db.upsellSuggestion.delete({ where: { id } });
    await record(req, "upsell.deleted", "upsell", id);
    changed();
    res.status(204).end();
  });

  // ── combos ────────────────────────────────────────────────────────────────
  on("POST", "/api/admin/combos", async (req, res) => {
    const input = parse(comboDealInput, req.body);
    const id = await db.$transaction((tx) => saveCombo(tx, null, input));
    await record(req, "combo.created", "combo", id, { name: input.name });
    changed();
    res.status(201).json({ id });
  });

  on("PUT", "/api/admin/combos/:comboId", async (req, res) => {
    const id = parse(zId, req.params.comboId);
    await requireRow(db.comboDeal.findUnique({ where: { id } }), "Combo");
    const input = parse(comboDealInput, req.body);
    await db.$transaction((tx) => saveCombo(tx, id, input));
    await record(req, "combo.updated", "combo", id, { name: input.name, active: input.active });
    changed();
    res.json({ id });
  });

  on("DELETE", "/api/admin/combos/:comboId", async (req, res) => {
    const id = parse(zId, req.params.comboId);
    await requireRow(db.comboDeal.findUnique({ where: { id } }), "Combo");
    await db.comboDeal.delete({ where: { id } });
    await record(req, "combo.deleted", "combo", id);
    changed();
    res.status(204).end();
  });
}
