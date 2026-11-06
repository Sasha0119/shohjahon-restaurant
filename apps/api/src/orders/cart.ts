import { lineSignature, type ModifierSelection } from "@app/shared";
import { rooms, type CartLineDTO } from "@app/shared/api";
import type { Db } from "../db.ts";
import { errors } from "../http/errors.ts";
import type { Realtime } from "../realtime/types.ts";
import { bumpVersion, type AuthedGuest } from "../sessions/service.ts";
import { buildCart, readSelection } from "../sessions/snapshot.ts";
import { checkSelection, loadOrderable } from "./catalog.ts";

/**
 * The shared table cart, stored on the server. Every change bumps the session
 * version and is pushed to every phone at the table.
 */

const MAX_QTY = 99;
const MAX_LINES = 60;

async function publish(db: Db, realtime: Realtime, sessionId: string, version: number) {
  const cart = await buildCart(db, sessionId);
  realtime.emit(rooms.session(sessionId), "cart:updated", { version, cart });
  return { version, cart };
}

export async function addToCart(
  db: Db,
  realtime: Realtime,
  guest: AuthedGuest,
  input: { itemId: string; quantity: number; selection: ModifierSelection; note?: string },
): Promise<{ version: number; cart: CartLineDTO[] }> {
  const orderable = (await loadOrderable(db, [input.itemId])).get(input.itemId)!;
  const { selection } = checkSelection(orderable, input.selection);
  const note = input.note?.trim() || null;

  const version = await db.$transaction(async (tx) => {
    const lines = await tx.cartItem.findMany({ where: { sessionId: guest.sessionId } });
    const signature = lineSignature({
      itemId: input.itemId,
      selection,
      note: note ?? undefined,
      addedByGuestId: guest.id,
    });
    const same = lines.find(
      (l) =>
        lineSignature({
          itemId: l.itemId,
          selection: readSelection(l.selection),
          note: l.note ?? undefined,
          addedByGuestId: l.guestId,
        }) === signature,
    );
    if (same) {
      await tx.cartItem.update({
        where: { id: same.id },
        data: { quantity: Math.min(MAX_QTY, same.quantity + input.quantity) },
      });
    } else {
      if (lines.length >= MAX_LINES)
        throw errors.badRequest("CART_FULL", "The cart is full. Send this round to the kitchen first.");
      await tx.cartItem.create({
        data: {
          sessionId: guest.sessionId,
          itemId: input.itemId,
          guestId: guest.id,
          quantity: input.quantity,
          selection,
          note,
        },
      });
    }
    return bumpVersion(tx, guest.sessionId);
  });
  return publish(db, realtime, guest.sessionId, version);
}

export async function updateCartLine(
  db: Db,
  realtime: Realtime,
  guest: AuthedGuest,
  lineId: string,
  patch: { quantity?: number; selection?: ModifierSelection; note?: string },
) {
  const line = await db.cartItem.findFirst({ where: { id: lineId, sessionId: guest.sessionId } });
  if (!line) throw errors.notFound("Cart item");
  let selection: ModifierSelection | undefined;
  if (patch.selection) {
    const orderable = (await loadOrderable(db, [line.itemId])).get(line.itemId)!;
    selection = checkSelection(orderable, patch.selection).selection;
  }
  const version = await db.$transaction(async (tx) => {
    await tx.cartItem.update({
      where: { id: line.id },
      data: {
        ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
        ...(selection ? { selection } : {}),
        ...(patch.note !== undefined ? { note: patch.note.trim() || null } : {}),
      },
    });
    return bumpVersion(tx, guest.sessionId);
  });
  return publish(db, realtime, guest.sessionId, version);
}

export async function removeCartLine(db: Db, realtime: Realtime, guest: AuthedGuest, lineId: string) {
  const version = await db.$transaction(async (tx) => {
    const res = await tx.cartItem.deleteMany({ where: { id: lineId, sessionId: guest.sessionId } });
    if (res.count === 0) throw errors.notFound("Cart item");
    return bumpVersion(tx, guest.sessionId);
  });
  return publish(db, realtime, guest.sessionId, version);
}
