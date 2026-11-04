# API reference

> Generated from `packages/shared/src/api/routes.ts` by `npm run docs:api`. Do not edit by hand.

- Base path `/api`, JSON bodies, money in integer **cents**.
- Errors: `{ "error": { "code": "CART_CHANGED", "message": "…", "details"?: … } }`.
- **guest** = has a guest cookie from scanning the table QR. Roles = staff cookie with that role.
- **Idem.** = requires an `Idempotency-Key` header (16–128 chars). Retrying returns the first response.
- Inputs are validated with the named Zod schema from `packages/shared/src/api/schemas.ts`.

**66 routes.**

## health

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/health` | public |  |  |  | 3 | Liveness + database check |

## auth

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | public | `passwordLoginBody` |  |  | 3 | Manager login with email + password _(rate limit: auth)_ |
| GET | `/api/auth/pin-staff` | public |  |  |  | 3 | Active waiter/kitchen names for the PIN pad (id + name only) _(rate limit: auth)_ |
| POST | `/api/auth/pin` | public | `pinLoginBody` |  |  | 3 | Waiter/kitchen login with staff id + PIN _(rate limit: auth)_ |
| POST | `/api/auth/logout` | manager, waiter, kitchen |  |  |  | 3 | Revoke the current staff session |
| GET | `/api/auth/me` | manager, waiter, kitchen |  |  |  | 3 | Current staff member and role |

## guest session

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| POST | `/api/tables/:qrToken/join` | public | `joinSessionBody` |  | `session:guests` `table:status` | 4 | Scan QR: verify signed token, join the open session or start one; sets guest cookie. 409 TABLE_OCCUPIED / OTHER_TABLE ask the guest to confirm _(rate limit: strict)_ |
| GET | `/api/session` | guest |  |  |  | 4 | Full session snapshot (table, guests, cart, orders, bill, version) |
| PATCH | `/api/session/me` | guest | `updateGuestBody` |  | `session:guests` | 4 | Set my nickname |
| POST | `/api/session/cart` | guest | `addCartItemBody` |  | `cart:updated` | 6 | Add an item to the shared cart |
| PATCH | `/api/session/cart/:cartItemId` | guest | `updateCartItemBody` |  | `cart:updated` | 6 | Change quantity / options / note |
| DELETE | `/api/session/cart/:cartItemId` | guest |  |  | `cart:updated` | 6 | Remove a cart line |
| POST | `/api/session/orders` | guest | `submitOrderBody` | ✓ | `cart:updated` `order:created` `kds:order` | 6 | Send the cart to the kitchen (one ticket per station) |
| POST | `/api/session/orders/:orderId/cancel` | guest |  |  | `order:updated` `kds:order` | 6 | Cancel a round while it is still RECEIVED |
| POST | `/api/session/calls` | guest | `createCallBody` |  | `call:created` | 6 | Call server (water / assistance / bill), with per-table cooldown _(rate limit: strict)_ |
| GET | `/api/session/bill` | guest | `billQuery` |  |  | 7 | Live bill: subtotal, discounts, service, tax, tip preview, paid, balance |
| POST | `/api/session/discount` | guest | `applyDiscountBody` |  | `bill:updated` | 7 | Apply a discount code _(rate limit: strict)_ |
| DELETE | `/api/session/discount` | guest |  |  | `bill:updated` | 7 | Remove the discount code |
| POST | `/api/session/payments` | guest | `createPaymentBody` | ✓ | `payment:updated` `bill:updated` `call:created` | 7 | Pay full / even / by item / custom. Cash alerts the waiter _(rate limit: strict)_ |
| GET | `/api/session/payments/:paymentId` | guest |  |  |  | 7 | Payment status (for redirects / 3-D Secure returns) |
| POST | `/api/session/review` | guest | `createReviewBody` |  | `feedback:created` | 8 | Rate the visit — only after paying; works after the table has closed. 4–5 stars → public review links, 1–3 → private feedback _(rate limit: strict)_ |

## menu

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/menu` | public |  |  |  | 5 | Categories (time-filtered), items, modifiers, upsells, combos. Cacheable (ETag) |
| PATCH | `/api/menu/items/:itemId/stock` | kitchen, manager | `updateStockBody` |  | `menu:stock` | 6 | Mark item in / out of stock (live for all guests) |

## kds

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/kds/orders` | kitchen, manager | `kdsQuery` |  |  | 6 | Active tickets, oldest first, optional station filter |
| PATCH | `/api/kds/orders/:orderId/status` | kitchen, manager | `updateOrderStatusBody` |  | `order:updated` `kds:order` | 6 | Advance status one step (audit logged) |

## waiter

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/waiter/calls` | waiter, manager |  |  |  | 6 | Open server calls with table number and time |
| POST | `/api/waiter/calls/:callId/handle` | waiter, manager |  |  | `call:updated` | 6 | Mark a call handled (guest sees 'on the way') |
| GET | `/api/waiter/tables` | waiter, manager |  |  |  | 6 | Live table status: free / occupied / ordering / waiting for bill |
| POST | `/api/waiter/sessions/:sessionId/close` | waiter, manager |  |  | `session:closed` `table:status` | 4 | Close a session manually (audit logged) |
| POST | `/api/waiter/sessions/:sessionId/cash` | waiter, manager | `confirmCashBody` |  | `payment:updated` `bill:updated` | 7 | Confirm a cash payment was received |

## payments

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| POST | `/api/payments/webhook/:provider` | public |  |  |  | 7 | Provider webhook (signature verified, idempotent) |

## receipts

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/receipts/:publicToken` | public |  |  |  | 7 | Digital receipt (unguessable link) |
| POST | `/api/receipts/:publicToken/email` | public | `emailReceiptBody` |  |  | 7 | Email the receipt _(rate limit: strict)_ |

## admin/feedback

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/feedback` | manager | `feedbackQuery` |  |  | 8 | Private feedback log (1–3 stars) |
| PATCH | `/api/admin/feedback/:reviewId` | manager | `updateFeedbackBody` |  |  | 8 | Mark feedback new / handled |

## admin/menu

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/menu` | manager |  |  |  | 5 | Full menu including inactive / archived |
| PUT | `/api/admin/menu/order` | manager | `menuOrderInput` |  | `menu:updated` | 5 | Reorder categories, or items within a category |

## admin/categories

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| POST | `/api/admin/categories` | manager | `categoryInput` |  | `menu:updated` | 5 | Create category (with availability windows) |
| PUT | `/api/admin/categories/:categoryId` | manager | `categoryInput` |  | `menu:updated` | 5 | Update category |
| DELETE | `/api/admin/categories/:categoryId` | manager |  |  | `menu:updated` | 5 | Delete an empty category |

## admin/items

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| POST | `/api/admin/items` | manager | `menuItemInput` |  | `menu:updated` | 5 | Create item with modifier groups |
| PUT | `/api/admin/items/:itemId` | manager | `menuItemInput` |  | `menu:updated` | 5 | Update item and its modifiers |
| DELETE | `/api/admin/items/:itemId` | manager |  |  | `menu:updated` | 5 | Archive item (kept for order history) |

## admin/uploads

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| POST | `/api/admin/uploads/images` | manager |  |  |  | 5 | Upload and optimise a menu photo _(rate limit: strict)_ |

## admin/upsells

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| POST | `/api/admin/upsells` | manager | `upsellSuggestionInput` |  | `menu:updated` | 5 | Add 'item X suggests item Y' |
| DELETE | `/api/admin/upsells/:upsellId` | manager |  |  | `menu:updated` | 5 | Remove a suggestion |

## admin/combos

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| POST | `/api/admin/combos` | manager | `comboDealInput` |  | `menu:updated` | 5 | Create combo deal |
| PUT | `/api/admin/combos/:comboId` | manager | `comboDealInput` |  | `menu:updated` | 5 | Update combo deal |
| DELETE | `/api/admin/combos/:comboId` | manager |  |  | `menu:updated` | 5 | Delete combo deal |

## admin/tables

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/tables` | manager |  |  |  | 4 | Tables with live status and their signed guest links |
| POST | `/api/admin/tables` | manager | `tableInput` |  | `table:status` | 4 | Create table |
| PUT | `/api/admin/tables/:tableId` | manager | `tableInput` |  | `table:status` | 4 | Update table |
| GET | `/api/admin/tables/:tableId/qr` | manager |  |  |  | 4 | QR code (SVG/PNG) with the signed table link, printable |
| POST | `/api/admin/tables/:tableId/rotate-qr` | manager |  |  |  | 4 | Invalidate printed QR codes for this table |

## admin/staff

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/staff` | manager |  |  |  | 3 | List staff |
| POST | `/api/admin/staff` | manager | `staffInput` |  |  | 3 | Create staff member |
| PATCH | `/api/admin/staff/:staffId` | manager | `staffUpdateInput` |  |  | 3 | Rename / activate / deactivate |
| POST | `/api/admin/staff/:staffId/reset-pin` | manager | `resetPinBody` |  |  | 3 | Set a new PIN (signs the member out everywhere) |
| POST | `/api/admin/staff/:staffId/reset-password` | manager | `resetPasswordBody` |  |  | 3 | Set a new password (signs out everywhere) |

## admin/discounts

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/discounts` | manager |  |  |  | 7 | List discount codes with usage |
| POST | `/api/admin/discounts` | manager | `discountCodeInput` |  |  | 7 | Create discount code |
| PATCH | `/api/admin/discounts/:discountId` | manager | `discountUpdateBody` |  |  | 7 | Activate / deactivate |

## admin/orders

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/orders` | manager | `ordersQuery` |  |  | 9 | Order history with filters, paginated |
| GET | `/api/admin/orders/export.csv` | manager | `ordersQuery` |  |  | 9 | CSV export of the filtered orders |

## admin/analytics

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/analytics` | manager | `dateRangeQuery` |  |  | 9 | Sales per day, top items, average bill, busiest hours, average rating |

## admin/audit

| Method | Path | Access | Input | Idem. | Emits | Phase | Description |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/audit` | manager | `auditQuery` |  |  | 9 | Audit log (status changes, payments, admin actions), filterable, paginated |

## Realtime (Socket.io)

Typed contract: `packages/shared/src/api/realtime.ts`.

**Rules**

1. Changes happen over REST only; sockets push what changed. The DB is the source of truth.
2. The server assigns rooms from the cookie: `session:<id>`, `kds:kitchen` / `kds:bar`, `waiters`, `managers`.
3. Every session event carries `version`. Next version → apply; older → ignore; gap → `session:sync`.
4. On every (re)connect the client emits `session:sync { version }` and gets `upToDate` or a full snapshot.

| Event | Direction | Room | Payload |
|---|---|---|---|
| `session:sync` | client → server (ack) | — | `{ version }` → `{ upToDate }` or `{ snapshot }` |
| `kds:subscribe` | client → server (ack) | — | `{ stations: ("kitchen"\|"bar")[] }` |
| `session:guests` | server → client | session | `{ version, guests }` |
| `cart:updated` | server → client | session | `{ version, cart }` |
| `order:created` | server → client | session | `{ version, tickets }` |
| `order:updated` | server → client | session | `{ version, orderId, round, station, status, at }` |
| `bill:updated` | server → client | session | `{ version, bill }` |
| `payment:updated` | server → client | session | `{ version, payment }` |
| `session:closed` | server → client | session | `{ version, reason: paid\|staff\|expired }` |
| `call:created` / `call:updated` | server → client | session + waiters | `{ call }` |
| `menu:stock` | server → client | everyone | `{ itemId, inStock, stockVersion }` (keep the highest stockVersion) |
| `menu:updated` | server → client | everyone | `{ menuVersion }` → refetch `GET /api/menu` |
| `kds:order` | server → client | kds:&lt;station&gt; + managers | `{ ticket }` |
| `table:status` | server → client | waiters + managers | `{ tableId, number, status }` |
