import { rooms, type CallDTO } from "@app/shared/api";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { CallType } from "../generated/prisma/enums.ts";
import { ApiError } from "../http/errors.ts";
import { enums } from "../lib/enums.ts";
import type { Realtime } from "../realtime/types.ts";
import { emitTableStatus, type AuthedGuest } from "../sessions/service.ts";

type CallRow = Prisma.WaiterCallGetPayload<{ include: { table: { select: { number: true } } } }>;

export function toCallDTO(c: CallRow): CallDTO {
  return {
    id: c.id,
    type: enums.callType.fromDb(c.type),
    status: c.status === "OPEN" ? "open" : "handled",
    tableNumber: c.table.number,
    createdAt: c.createdAt.toISOString(),
    amountCents: c.amountCents,
    paymentId: c.paymentId,
    sessionId: c.sessionId,
  };
}

/**
 * Guest calls a server. Per table and per request type there is a cooldown;
 * an advisory lock makes the check race-free when several phones tap at once.
 */
export async function createCall(
  db: Db,
  realtime: Realtime,
  guest: AuthedGuest,
  type: CallType,
  cooldownSeconds: number,
  amountCents?: number,
): Promise<CallDTO> {
  const call = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`call:${guest.tableId}:${type}`}))`;
    const last = await tx.waiterCall.findFirst({
      where: { tableId: guest.tableId, type },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const waitMs = last ? last.createdAt.getTime() + cooldownSeconds * 1000 - Date.now() : 0;
    if (waitMs > 0) {
      throw new ApiError(429, "CALL_COOLDOWN", "We've already let the team know. You can call again shortly.", {
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      });
    }
    const created = await tx.waiterCall.create({
      data: { sessionId: guest.sessionId, tableId: guest.tableId, type, amountCents: amountCents ?? null },
      include: { table: { select: { number: true } } },
    });
    await audit(tx, {
      actor: { type: "guest", guestId: guest.id },
      action: "call.created",
      entityType: "waiter_call",
      entityId: created.id,
      data: { type },
    });
    return created;
  });
  const dto = toCallDTO(call);
  realtime.emit([rooms.session(guest.sessionId), rooms.waiters], "call:created", { call: dto });
  if (type === "BILL") await emitTableStatus(db, realtime, guest.tableId);
  return dto;
}

export async function handleCall(db: Db, realtime: Realtime, callId: string, staffId: string, ip?: string): Promise<CallDTO> {
  const res = await db.waiterCall.updateMany({
    where: { id: callId, status: "OPEN" },
    data: { status: "HANDLED", handledAt: new Date(), handledById: staffId },
  });
  const call = await db.waiterCall.findUnique({ where: { id: callId }, include: { table: { select: { number: true } } } });
  if (!call) throw new ApiError(404, "NOT_FOUND", "Call not found.");
  if (res.count === 0) throw new ApiError(409, "ALREADY_HANDLED", "Someone has already taken this one.");
  await audit(db, {
    actor: { type: "staff", staffId },
    action: "call.handled",
    entityType: "waiter_call",
    entityId: callId,
    data: { type: call.type },
    ip,
  });
  const dto = toCallDTO(call);
  realtime.emit([rooms.session(call.sessionId), rooms.waiters], "call:updated", { call: dto });
  await emitTableStatus(db, realtime, call.tableId);
  return dto;
}
