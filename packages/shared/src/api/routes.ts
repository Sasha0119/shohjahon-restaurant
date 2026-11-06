/**
 * The REST API surface — single source of truth.
 *
 * Each later phase implements these routes; `docs/api.md` is generated from
 * this list (`npm run docs:api`) and a test enforces the security rules below.
 *
 * Auth kinds
 *  • public  — anyone (rate limited)
 *  • guest   — a guest who joined a table session (guest token cookie)
 *  • staff   — logged-in staff with one of the listed roles
 *
 * Conventions
 *  • JSON everywhere, prefix /api, errors as { error: { code, message, details? } }
 *  • Unsafe guest money/order actions require an `Idempotency-Key` header
 *  • Every state change bumps the session `version` and emits a Socket.io event
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type Role = "manager" | "waiter" | "kitchen";
export type Access = { kind: "public" } | { kind: "guest" } | { kind: "staff"; roles: Role[] };
export type RateLimit = "default" | "strict" | "auth" | "booking";

export interface RouteDef {
  method: HttpMethod;
  path: string;
  access: Access;
  summary: string;
  /** Name of the Zod schema in api/schemas.ts that validates the body or query. */
  input?: string;
  /** Requires an Idempotency-Key header; a retried request returns the first result. */
  idempotent?: boolean;
  rateLimit?: RateLimit;
  /** Guest routes only: also allow a guest whose visit ended (paid/closed) in the last 24 h. */
  allowClosedSession?: boolean;
  /** Socket.io events emitted on success (see realtime.ts). */
  emits?: string[];
  /** Phase that implements it. */
  phase: number;
}

const pub: Access = { kind: "public" };
const guest: Access = { kind: "guest" };
const staff = (...roles: Role[]): Access => ({ kind: "staff", roles });
const MANAGER = staff("manager");

export const routes: RouteDef[] = [
  // ── System ────────────────────────────────────────────────────────────────
  { method: "GET", path: "/api/health", access: pub, summary: "Liveness + database check", phase: 3 },

  // ── Staff auth (Phase 3) ──────────────────────────────────────────────────
  { method: "POST", path: "/api/auth/login", access: pub, summary: "Manager login with email + password", input: "passwordLoginBody", rateLimit: "auth", phase: 3 },
  { method: "GET", path: "/api/auth/pin-staff", access: pub, summary: "Active waiter/kitchen names for the PIN pad (id + name only)", rateLimit: "auth", phase: 3 },
  { method: "POST", path: "/api/auth/pin", access: pub, summary: "Waiter/kitchen login with staff id + PIN", input: "pinLoginBody", rateLimit: "auth", phase: 3 },
  { method: "POST", path: "/api/auth/logout", access: staff("manager", "waiter", "kitchen"), summary: "Revoke the current staff session", phase: 3 },
  { method: "GET", path: "/api/auth/me", access: staff("manager", "waiter", "kitchen"), summary: "Current staff member and role", phase: 3 },

  // ── Guest: table session (Phase 4) ────────────────────────────────────────
  { method: "POST", path: "/api/tables/:qrToken/join", access: pub, summary: "Scan QR: verify signed token, join the open session or start one; sets guest cookie. 409 TABLE_OCCUPIED / OTHER_TABLE / TABLE_RESERVED ask the guest to confirm", input: "joinSessionBody", rateLimit: "strict", emits: ["session:guests", "table:status"], phase: 4 },
  { method: "GET", path: "/api/session", access: guest, summary: "Full session snapshot (table, guests, cart, orders, bill, version)", phase: 4 },
  { method: "PATCH", path: "/api/session/me", access: guest, summary: "Set my nickname", input: "updateGuestBody", emits: ["session:guests"], phase: 4 },

  // ── Menu (Phase 5) ────────────────────────────────────────────────────────
  { method: "GET", path: "/api/menu", access: pub, summary: "Categories (time-filtered), items, modifiers, upsells, combos. Cacheable (ETag)", phase: 5 },

  // ── Guest: cart & orders (Phase 6) ────────────────────────────────────────
  { method: "POST", path: "/api/session/cart", access: guest, summary: "Add an item to the shared cart", input: "addCartItemBody", emits: ["cart:updated"], phase: 6 },
  { method: "PATCH", path: "/api/session/cart/:cartItemId", access: guest, summary: "Change quantity / options / note", input: "updateCartItemBody", emits: ["cart:updated"], phase: 6 },
  { method: "DELETE", path: "/api/session/cart/:cartItemId", access: guest, summary: "Remove a cart line", emits: ["cart:updated"], phase: 6 },
  { method: "POST", path: "/api/session/orders", access: guest, summary: "Send the cart to the kitchen (one ticket per station)", input: "submitOrderBody", idempotent: true, emits: ["cart:updated", "order:created", "kds:order"], phase: 6 },
  { method: "POST", path: "/api/session/orders/:orderId/cancel", access: guest, summary: "Cancel a round while it is still RECEIVED", emits: ["order:updated", "kds:order"], phase: 6 },
  { method: "POST", path: "/api/session/calls", access: guest, summary: "Call server (water / assistance / bill), with per-table cooldown", input: "createCallBody", rateLimit: "strict", emits: ["call:created"], phase: 6 },

  // ── Kitchen display (Phase 6) ─────────────────────────────────────────────
  { method: "GET", path: "/api/kds/orders", access: staff("kitchen", "manager"), summary: "Active tickets, oldest first, optional station filter", input: "kdsQuery", phase: 6 },
  { method: "PATCH", path: "/api/kds/orders/:orderId/status", access: staff("kitchen", "manager"), summary: "Advance status one step (audit logged)", input: "updateOrderStatusBody", emits: ["order:updated", "kds:order"], phase: 6 },
  { method: "PATCH", path: "/api/menu/items/:itemId/stock", access: staff("kitchen", "manager"), summary: "Mark item in / out of stock (live for all guests)", input: "updateStockBody", emits: ["menu:stock"], phase: 6 },

  // ── Waiter (Phase 6) ──────────────────────────────────────────────────────
  { method: "GET", path: "/api/waiter/calls", access: staff("waiter", "manager"), summary: "Open server calls with table number and time", phase: 6 },
  { method: "POST", path: "/api/waiter/calls/:callId/handle", access: staff("waiter", "manager"), summary: "Mark a call handled (guest sees 'on the way')", emits: ["call:updated"], phase: 6 },
  { method: "GET", path: "/api/waiter/tables", access: staff("waiter", "manager"), summary: "Live table status: free / occupied / ordering / waiting for bill", phase: 6 },
  { method: "POST", path: "/api/waiter/sessions/:sessionId/close", access: staff("waiter", "manager"), summary: "Close a session manually (audit logged)", emits: ["session:closed", "table:status"], phase: 4 },

  // ── Guest: bill & payments (Phase 7) ──────────────────────────────────────
  { method: "GET", path: "/api/session/bill", access: guest, summary: "Live bill: subtotal, discounts, service, tax, tip preview, paid, balance", input: "billQuery", phase: 7 },
  { method: "POST", path: "/api/session/discount", access: guest, summary: "Apply a discount code", input: "applyDiscountBody", rateLimit: "strict", emits: ["bill:updated"], phase: 7 },
  { method: "DELETE", path: "/api/session/discount", access: guest, summary: "Remove the discount code", emits: ["bill:updated"], phase: 7 },
  { method: "POST", path: "/api/session/payments", access: guest, summary: "Pay full / even / by item / custom. Cash alerts the waiter", input: "createPaymentBody", idempotent: true, rateLimit: "strict", emits: ["payment:updated", "bill:updated", "call:created"], phase: 7 },
  { method: "GET", path: "/api/session/payments/:paymentId", access: guest, summary: "Payment status (for redirects / 3-D Secure returns)", phase: 7 },
  { method: "POST", path: "/api/payments/webhook/:provider", access: pub, summary: "Provider webhook (signature verified, idempotent)", phase: 7 },
  { method: "POST", path: "/api/waiter/sessions/:sessionId/cash", access: staff("waiter", "manager"), summary: "Confirm a cash payment was received", input: "confirmCashBody", emits: ["payment:updated", "bill:updated"], phase: 7 },
  { method: "GET", path: "/api/receipts/:publicToken", access: pub, summary: "Digital receipt (unguessable link)", phase: 7 },
  { method: "POST", path: "/api/receipts/:publicToken/email", access: pub, summary: "Email the receipt", input: "emailReceiptBody", rateLimit: "strict", phase: 7 },

  // ── Reviews (Phase 8) ─────────────────────────────────────────────────────
  { method: "POST", path: "/api/session/review", access: guest, allowClosedSession: true, summary: "Rate the visit — only after paying; works after the table has closed. 4–5 stars → public review links, 1–3 → private feedback", input: "createReviewBody", rateLimit: "strict", emits: ["feedback:created"], phase: 8 },
  { method: "GET", path: "/api/admin/feedback", access: MANAGER, summary: "Private feedback log (1–3 stars)", input: "feedbackQuery", phase: 8 },
  { method: "PATCH", path: "/api/admin/feedback/:reviewId", access: MANAGER, summary: "Mark feedback new / handled", input: "updateFeedbackBody", phase: 8 },

  // ── Admin: menu (Phase 5) ─────────────────────────────────────────────────
  { method: "GET", path: "/api/admin/menu", access: MANAGER, summary: "Full menu including inactive / archived", phase: 5 },
  { method: "POST", path: "/api/admin/categories", access: MANAGER, summary: "Create category (with availability windows)", input: "categoryInput", emits: ["menu:updated"], phase: 5 },
  { method: "PUT", path: "/api/admin/categories/:categoryId", access: MANAGER, summary: "Update category", input: "categoryInput", emits: ["menu:updated"], phase: 5 },
  { method: "DELETE", path: "/api/admin/categories/:categoryId", access: MANAGER, summary: "Delete an empty category", emits: ["menu:updated"], phase: 5 },
  { method: "POST", path: "/api/admin/items", access: MANAGER, summary: "Create item with modifier groups", input: "menuItemInput", emits: ["menu:updated"], phase: 5 },
  { method: "PUT", path: "/api/admin/items/:itemId", access: MANAGER, summary: "Update item and its modifiers", input: "menuItemInput", emits: ["menu:updated"], phase: 5 },
  { method: "DELETE", path: "/api/admin/items/:itemId", access: MANAGER, summary: "Archive item (kept for order history)", emits: ["menu:updated"], phase: 5 },
  { method: "PUT", path: "/api/admin/menu/order", access: MANAGER, summary: "Reorder categories, or items within a category", input: "menuOrderInput", emits: ["menu:updated"], phase: 5 },
  { method: "POST", path: "/api/admin/uploads/images", access: MANAGER, summary: "Upload and optimise a menu photo", rateLimit: "strict", phase: 5 },
  { method: "POST", path: "/api/admin/upsells", access: MANAGER, summary: "Add 'item X suggests item Y'", input: "upsellSuggestionInput", emits: ["menu:updated"], phase: 5 },
  { method: "DELETE", path: "/api/admin/upsells/:upsellId", access: MANAGER, summary: "Remove a suggestion", emits: ["menu:updated"], phase: 5 },
  { method: "POST", path: "/api/admin/combos", access: MANAGER, summary: "Create combo deal", input: "comboDealInput", emits: ["menu:updated"], phase: 5 },
  { method: "PUT", path: "/api/admin/combos/:comboId", access: MANAGER, summary: "Update combo deal", input: "comboDealInput", emits: ["menu:updated"], phase: 5 },
  { method: "DELETE", path: "/api/admin/combos/:comboId", access: MANAGER, summary: "Delete combo deal", emits: ["menu:updated"], phase: 5 },

  // ── Reservations ──────────────────────────────────────────────────────────
  { method: "POST", path: "/api/reservations", access: pub, summary: "Book a table online: assigns the smallest free table that fits. 409 NO_TABLE_AVAILABLE, 422 RESERVATION_TIME_INVALID, 429 TOO_MANY_RESERVATIONS", input: "createReservationBody", rateLimit: "booking", emits: ["table:status"], phase: 9 },
  { method: "GET", path: "/api/waiter/reservations", access: staff("waiter", "manager"), summary: "Upcoming reservations with the guest's name and phone", phase: 9 },
  { method: "POST", path: "/api/waiter/reservations/:reservationId/cancel", access: staff("waiter", "manager"), summary: "Cancel a reservation and release its table", emits: ["table:status"], phase: 9 },

  // ── Admin: tables (Phase 4) ───────────────────────────────────────────────
  { method: "GET", path: "/api/admin/tables", access: MANAGER, summary: "Tables with live status and their signed guest links", phase: 4 },
  { method: "POST", path: "/api/admin/tables", access: MANAGER, summary: "Create table", input: "tableInput", emits: ["table:status"], phase: 4 },
  { method: "PUT", path: "/api/admin/tables/:tableId", access: MANAGER, summary: "Update table", input: "tableInput", emits: ["table:status"], phase: 4 },
  { method: "GET", path: "/api/admin/tables/:tableId/qr", access: MANAGER, summary: "QR code (SVG/PNG) with the signed table link, printable", phase: 4 },
  { method: "POST", path: "/api/admin/tables/:tableId/rotate-qr", access: MANAGER, summary: "Invalidate printed QR codes for this table", phase: 4 },

  // ── Admin: staff (Phase 3) ────────────────────────────────────────────────
  { method: "GET", path: "/api/admin/staff", access: MANAGER, summary: "List staff", phase: 3 },
  { method: "POST", path: "/api/admin/staff", access: MANAGER, summary: "Create staff member", input: "staffInput", phase: 3 },
  { method: "PATCH", path: "/api/admin/staff/:staffId", access: MANAGER, summary: "Rename / activate / deactivate", input: "staffUpdateInput", phase: 3 },
  { method: "POST", path: "/api/admin/staff/:staffId/reset-pin", access: MANAGER, summary: "Set a new PIN (signs the member out everywhere)", input: "resetPinBody", phase: 3 },
  { method: "POST", path: "/api/admin/staff/:staffId/reset-password", access: MANAGER, summary: "Set a new password (signs out everywhere)", input: "resetPasswordBody", phase: 3 },

  // ── Admin: discounts (Phase 7) ────────────────────────────────────────────
  { method: "GET", path: "/api/admin/discounts", access: MANAGER, summary: "List discount codes with usage", phase: 7 },
  { method: "POST", path: "/api/admin/discounts", access: MANAGER, summary: "Create discount code", input: "discountCodeInput", phase: 7 },
  { method: "PATCH", path: "/api/admin/discounts/:discountId", access: MANAGER, summary: "Activate / deactivate", input: "discountUpdateBody", phase: 7 },

  // ── Admin: orders, analytics, audit (Phase 9) ─────────────────────────────
  { method: "GET", path: "/api/admin/orders", access: MANAGER, summary: "Order history with filters, paginated", input: "ordersQuery", phase: 9 },
  { method: "GET", path: "/api/admin/orders/export.csv", access: MANAGER, summary: "CSV export of the filtered orders", input: "ordersQuery", phase: 9 },
  { method: "GET", path: "/api/admin/analytics", access: MANAGER, summary: "Sales per day, top items, average bill, busiest hours, average rating", input: "dateRangeQuery", phase: 9 },
  { method: "GET", path: "/api/admin/audit", access: MANAGER, summary: "Audit log (status changes, payments, admin actions), filterable, paginated", input: "auditQuery", phase: 9 },
];
