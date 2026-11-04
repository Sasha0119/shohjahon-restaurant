/**
 * Socket.io contract (typed for both `socket.io` and `socket.io-client`).
 *
 * Principles
 *  • The server is the source of truth. All changes go through REST; sockets
 *    only PUSH what changed. A lost socket message can never lose an order.
 *  • The server decides which rooms a socket joins, from its cookie — clients
 *    never name a room themselves.
 *  • Every event for a table session carries the session `version`. If a
 *    client sees a gap (it missed an event, e.g. while reconnecting), it calls
 *    `session:sync` and receives a full snapshot.
 *  • Socket.io reconnects automatically (exponential backoff); on `connect`
 *    the client always calls `session:sync` once.
 */
import type {
  BillDTO,
  CallDTO,
  CartLineDTO,
  FeedbackDTO,
  GuestDTO,
  OrderTicketDTO,
  PaymentDTO,
  SessionCloseReasonDTO,
  SessionSnapshotDTO,
  TableStatusDTO,
} from "./dto";
import type { OrderStatus, Station } from "../types";

// ── rooms ────────────────────────────────────────────────────────────────────
export const rooms = {
  /** Guests at one table + staff watching it. */
  session: (sessionId: string) => `session:${sessionId}`,
  /** Kitchen display for one station. */
  kds: (station: Station) => `kds:${station}`,
  /** All logged-in waiters (calls, table status). */
  waiters: "waiters",
  /** All logged-in managers (live dashboard). */
  managers: "managers",
  /** Every connected socket (menu changes, stock). */
  everyone: "everyone",
} as const;

// ── server → client ──────────────────────────────────────────────────────────
interface Versioned {
  /** Session version after this change. */
  version: number;
}

export interface ServerToClientEvents {
  /** Guest joined / changed nickname. → session room */
  "session:guests": (p: Versioned & { guests: GuestDTO[] }) => void;
  /** Shared cart changed (anyone at the table). → session room */
  "cart:updated": (p: Versioned & { cart: CartLineDTO[] }) => void;
  /** A round was sent to the kitchen. → session room */
  "order:created": (p: Versioned & { tickets: OrderTicketDTO[] }) => void;
  /** A ticket's status changed (kitchen) or was cancelled (guest). → session room */
  "order:updated": (
    p: Versioned & { orderId: string; round: number; station: Station; status: OrderStatus; at: string },
  ) => void;
  /** Bill totals changed (order, discount, payment). → session room */
  "bill:updated": (p: Versioned & { bill: BillDTO }) => void;
  /** A payment changed state. → session room */
  "payment:updated": (p: Versioned & { payment: PaymentDTO }) => void;
  /** Our call was created / handled ("on the way"). → session room + waiters */
  "call:created": (p: { call: CallDTO }) => void;
  "call:updated": (p: { call: CallDTO }) => void;
  /** Session ended (paid, closed by staff, expired). → session room */
  "session:closed": (p: Versioned & { reason: SessionCloseReasonDTO }) => void;

  /**
   * Item stock changed. → everyone (guests + staff)
   * `stockVersion` goes up with every change: apply an event only if it is
   * newer than what you have (events can arrive out of order).
   */
  "menu:stock": (p: { itemId: string; inStock: boolean; stockVersion: number }) => void;
  /** Menu edited by a manager: clients refetch GET /api/menu. → everyone */
  "menu:updated": (p: { menuVersion: string }) => void;

  /** New / changed ticket for a station. → kds:<station> + managers */
  "kds:order": (p: { ticket: OrderTicketDTO }) => void;
  /** New private (1–3 star) feedback. → managers */
  "feedback:created": (p: { feedback: FeedbackDTO }) => void;
  /** Table occupancy changed. → waiters + managers */
  "table:status": (p: { tableId: string; number: number; status: TableStatusDTO }) => void;
}

// ── client → server ──────────────────────────────────────────────────────────
export type SyncAck =
  | { ok: true; upToDate: true; version: number }
  | { ok: true; upToDate: false; snapshot: SessionSnapshotDTO }
  | { ok: false; error: "NO_SESSION" | "SESSION_CLOSED" };

export interface ClientToServerEvents {
  /** Guests: "I have version N" → server replies with nothing new or a full snapshot. */
  "session:sync": (p: { version: number }, ack: (res: SyncAck) => void) => void;
  /** Kitchen screens: choose which station(s) to receive. */
  "kds:subscribe": (p: { stations: Station[] }, ack: (res: { ok: boolean }) => void) => void;
}

/** Per-socket data the server attaches after authenticating the handshake. */
export type SocketData =
  | { kind: "guest"; guestId: string; sessionId: string }
  | { kind: "staff"; staffId: string; role: "manager" | "waiter" | "kitchen" };

// ── helpers ──────────────────────────────────────────────────────────────────
export const SESSION_EVENTS = [
  "session:guests",
  "cart:updated",
  "order:created",
  "order:updated",
  "bill:updated",
  "payment:updated",
  "session:closed",
] as const satisfies readonly (keyof ServerToClientEvents)[];

/**
 * Decide what to do with a versioned event.
 *  • "apply"  — it's the next version
 *  • "ignore" — stale/duplicate (already have it)
 *  • "resync" — we missed something: ask for a snapshot
 */
export function versionAction(localVersion: number, eventVersion: number): "apply" | "ignore" | "resync" {
  if (eventVersion <= localVersion) return "ignore";
  if (eventVersion === localVersion + 1) return "apply";
  return "resync";
}

/**
 * Recommended socket.io-client options for flaky mobile networks.
 * Long-polling first, then upgrade to WebSocket: works through any proxy
 * and never leaves a phone without updates.
 */
export const SOCKET_CLIENT_OPTIONS = {
  path: "/socket.io",
  withCredentials: true,
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 8_000,
  randomizationFactor: 0.5,
  timeout: 10_000,
} as const;
