import type { Db } from "./db.ts";
import type { Prisma } from "./generated/prisma/client.ts";

export interface AuditEntry {
  actor: { type: "staff"; staffId: string } | { type: "guest"; guestId: string } | { type: "system" };
  /** e.g. "staff.login", "staff.pin_reset", "order.status_changed" */
  action: string;
  entityType: string;
  entityId: string;
  data?: Prisma.InputJsonValue;
  ip?: string;
}

/** Append one audit record. Pass a transaction client to make it atomic with the change. */
export async function audit(db: Pick<Db, "auditLog">, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: entry.actor.type === "staff" ? "STAFF" : entry.actor.type === "guest" ? "GUEST" : "SYSTEM",
      actorStaffId: entry.actor.type === "staff" ? entry.actor.staffId : null,
      actorGuestId: entry.actor.type === "guest" ? entry.actor.guestId : null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.data !== undefined ? { data: entry.data } : {}),
      ip: entry.ip ?? null,
    },
  });
}
