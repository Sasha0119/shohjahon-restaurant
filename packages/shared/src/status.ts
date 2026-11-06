import type { OrderStatus } from "./types";

/** The kitchen flow, in order. "cancelled" is a terminal side-state. */
export const ORDER_FLOW: Exclude<OrderStatus, "cancelled">[] = ["received", "preparing", "ready", "served"];

export function statusIndex(status: OrderStatus): number {
  return status === "cancelled" ? -1 : ORDER_FLOW.indexOf(status);
}

/** Guests may cancel only before the kitchen starts. */
export function canGuestCancel(status: OrderStatus): boolean {
  return status === "received";
}

/** Allowed kitchen transitions: one step forward, or cancel while received. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === "cancelled") return from === "received";
  const a = statusIndex(from);
  const b = statusIndex(to);
  return a >= 0 && b === a + 1;
}

/**
 * A round may be split into a kitchen and a bar ticket. Guests see one status
 * for the round: the least advanced of its live tickets ("cancelled" only if
 * every ticket was cancelled).
 */
export function roundStatus(statuses: OrderStatus[]): OrderStatus {
  const live = statuses.filter((s) => s !== "cancelled");
  if (live.length === 0) return "cancelled";
  return ORDER_FLOW[Math.min(...live.map(statusIndex))]!;
}

export type Urgency = "normal" | "warn" | "late";

/** Kitchen display colour for a ticket that arrived at `createdAt`. */
export function ticketUrgency(
  createdAt: number,
  now: number,
  cfg: { warnAfterMinutes: number; lateAfterMinutes: number },
): Urgency {
  const minutes = (now - createdAt) / 60_000;
  if (minutes >= cfg.lateAfterMinutes) return "late";
  if (minutes >= cfg.warnAfterMinutes) return "warn";
  return "normal";
}

/**
 * Live ticket updates can arrive out of order (e.g. the "new order" broadcast
 * landing after a cook already tapped Start). An update is applied only if it
 * isn't older than what the screen already shows: status never moves
 * backwards, and an older status-change time never overwrites a newer one.
 * A cancellation always wins.
 */
export function isTicketUpdateNewer(
  existing: { status: OrderStatus; statusChangedAt: string } | undefined,
  incoming: { status: OrderStatus; statusChangedAt: string },
): boolean {
  if (!existing) return true;
  if (incoming.status === "cancelled") return true;
  if (existing.status === "cancelled") return false;
  if (statusIndex(incoming.status) < statusIndex(existing.status)) return false;
  return incoming.statusChangedAt >= existing.statusChangedAt;
}
