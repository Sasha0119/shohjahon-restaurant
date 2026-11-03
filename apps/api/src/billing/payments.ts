import { brand } from "@app/config";
import { isAllowedAmount } from "@app/shared";
import { rooms, type CreatePaymentBody, type PaymentDTO, type ReceiptDTO } from "@app/shared/api";
import { audit } from "../audit.ts";
import { newToken } from "../auth/tokens.ts";
import { toCallDTO } from "../calls/service.ts";
import type { Db } from "../db.ts";
import type { Payment, Prisma } from "../generated/prisma/client.ts";
import { ApiError, errors } from "../http/errors.ts";
import { enums } from "../lib/enums.ts";
import type { Realtime } from "../realtime/types.ts";
import { bumpVersion, closeSession, emitTableStatus, type AuthedGuest } from "../sessions/service.ts";
import { computeSessionBill } from "./bill.ts";
import type { ChargeOutcome, PaymentProvider } from "./provider.ts";

type Tx = Prisma.TransactionClient;

export function toPaymentDTO(p: Payment & { receipt?: { publicToken: string } | null }): PaymentDTO {
  return {
    id: p.id,
    status: enums.paymentStatus.fromDb(p.status),
    method: enums.paymentMethod.fromDb(p.method),
    amountCents: p.amountCents,
    tipCents: p.tipCents,
    receiptToken: p.receipt?.publicToken ?? null,
    failureReason: p.failureReason,
  };
}

/** Serialise everything that changes a session's money (payments, discount code). */
export async function lockSessionMoney(tx: Tx, sessionId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`money:${sessionId}`}))`;
}

/**
 * Step 1 (inside the idempotency transaction): validate and reserve.
 * Creates a PENDING payment — which immediately reduces what others can pay —
 * and, for cash, alerts the waiter.
 */
export async function startPayment(
  tx: Tx,
  guest: AuthedGuest,
  input: CreatePaymentBody,
  idempotencyKey: string,
  providerName: string,
): Promise<{ paymentId: string; version: number; callId: string | null }> {
  await lockSessionMoney(tx, guest.sessionId);
  const session = await tx.tableSession.findUniqueOrThrow({ where: { id: guest.sessionId }, select: { status: true } });
  if (session.status !== "OPEN") throw new ApiError(410, "SESSION_CLOSED", "This visit has ended.");

  const bill = await computeSessionBill(tx, guest.sessionId);
  if (bill.outstanding <= 0) {
    throw new ApiError(409, "NOTHING_TO_PAY", bill.dto.pendingCents > 0 ? "A payment is already in progress for the rest of the bill." : "There is nothing left to pay.");
  }

  let selectedSubtotal = 0;
  const itemIds = input.splitMode === "items" ? [...new Set(input.orderItemIds ?? [])] : [];
  if (input.splitMode === "items") {
    const byId = new Map(bill.lines.map((l) => [l.id, l]));
    for (const id of itemIds) {
      const line = byId.get(id);
      if (!line) throw errors.badRequest("UNKNOWN_ITEM", "One of those items isn't on this table's bill.");
      if (bill.claimed.has(id)) {
        throw new ApiError(409, "ITEMS_ALREADY_PAID", `${line.name} has already been paid by someone else.`, { orderItemId: id });
      }
      selectedSubtotal += line.unitPriceCents * line.quantity;
    }
  }

  const ctx = { total: bill.total, subtotal: bill.subtotal, outstanding: bill.outstanding };
  const opts = { people: input.people, selectedSubtotal };
  if (!isAllowedAmount(input.amountCents, input.splitMode, ctx, opts)) {
    throw new ApiError(409, "AMOUNT_CHANGED", "The bill changed. Please check the amount and try again.", {
      outstandingCents: bill.outstanding,
    });
  }
  if (input.tipCents > input.amountCents) {
    throw errors.badRequest("TIP_TOO_HIGH", "The tip can't be more than the amount you're paying.");
  }

  const cash = input.method === "cash";
  const payment = await tx.payment.create({
    data: {
      sessionId: guest.sessionId,
      guestId: guest.id,
      amountCents: input.amountCents,
      tipCents: input.tipCents,
      method: enums.paymentMethod.toDb(input.method),
      splitMode: enums.splitMode.toDb(input.splitMode),
      provider: cash ? "cash" : providerName,
      idempotencyKey,
      items: itemIds.length ? { create: itemIds.map((orderItemId) => ({ orderItemId })) } : undefined,
    },
  });
  let callId: string | null = null;
  if (cash) {
    const call = await tx.waiterCall.create({
      data: {
        sessionId: guest.sessionId,
        tableId: guest.tableId,
        type: "CASH_PAYMENT",
        amountCents: input.amountCents + input.tipCents,
        paymentId: payment.id,
      },
    });
    callId = call.id;
  }
  await audit(tx, {
    actor: { type: "guest", guestId: guest.id },
    action: "payment.started",
    entityType: "payment",
    entityId: payment.id,
    data: { amountCents: input.amountCents, tipCents: input.tipCents, method: input.method, splitMode: input.splitMode },
  });
  const version = await bumpVersion(tx, guest.sessionId);
  return { paymentId: payment.id, version, callId };
}

/** Broadcast the current state of a payment and the bill to the table. */
async function publishMoney(db: Db, realtime: Realtime, sessionId: string, paymentId: string, version: number) {
  const [payment, bill] = await Promise.all([
    db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { receipt: { select: { publicToken: true } } } }),
    computeSessionBill(db, sessionId),
  ]);
  realtime.emit(rooms.session(sessionId), "payment:updated", { version, payment: toPaymentDTO(payment) });
  realtime.emit(rooms.session(sessionId), "bill:updated", { version, bill: bill.dto });
  return { payment: toPaymentDTO(payment), bill: bill.dto };
}

/** After step 1 commits: tell the table, and alert the waiter for cash. */
export async function publishStarted(db: Db, realtime: Realtime, sessionId: string, started: { paymentId: string; version: number; callId: string | null }) {
  await publishMoney(db, realtime, sessionId, started.paymentId, started.version);
  if (started.callId) {
    const call = await db.waiterCall.findUniqueOrThrow({ where: { id: started.callId }, include: { table: { select: { number: true } } } });
    realtime.emit([rooms.session(sessionId), rooms.waiters], "call:created", { call: toCallDTO(call) });
  }
}

/**
 * Step 2: charge a PENDING card/wallet payment through the provider. The
 * provider is idempotent on our payment id, so retries never double-charge.
 */
export async function chargePending(db: Db, realtime: Realtime, provider: PaymentProvider, paymentId: string) {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status !== "PENDING" || payment.method === "CASH") return;
  let outcome: ChargeOutcome;
  try {
    outcome = await provider.charge({
      paymentId,
      amountCents: payment.amountCents + payment.tipCents,
      currency: brand.currency.code,
      method: enums.paymentMethod.fromDb(payment.method) as "card" | "applePay" | "googlePay",
      description: `${brand.name} — table bill`,
    });
  } catch {
    outcome = { status: "failed", providerRef: null, reason: "provider_unavailable" };
  }
  await settlePayment(db, realtime, paymentId, outcome);
}

/**
 * Final state of a payment (provider result, webhook, or a waiter confirming
 * cash). Compare-and-set from PENDING, so it can't be applied twice. On
 * success: receipt, audit, and — if nothing is left to pay — the session closes.
 */
export async function settlePayment(
  db: Db,
  realtime: Realtime,
  paymentId: string,
  outcome: ChargeOutcome,
  opts: { cashStaffId?: string; ip?: string } = {},
): Promise<void> {
  const settled = await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await lockSessionMoney(tx, payment.sessionId);
    const res = await tx.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data:
        outcome.status === "succeeded"
          ? { status: "SUCCEEDED", providerRef: outcome.providerRef, completedAt: new Date(), cashConfirmedById: opts.cashStaffId ?? null }
          : { status: "FAILED", providerRef: outcome.providerRef, failureReason: outcome.reason, completedAt: new Date() },
    });
    if (res.count === 0) return null; // already settled — nothing to do

    if (outcome.status === "succeeded") {
      const bill = await computeSessionBill(tx, payment.sessionId);
      const session = await tx.tableSession.findUniqueOrThrow({ where: { id: payment.sessionId }, include: { table: { select: { number: true } } } });
      const snapshot: Omit<ReceiptDTO, "number" | "issuedAt" | "emailedTo"> = {
        tableNumber: session.table.number,
        lines: bill.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, options: l.options })),
        bill: {
          subtotalCents: bill.dto.subtotalCents,
          comboDiscountCents: bill.dto.comboDiscountCents,
          codeDiscountCents: bill.dto.codeDiscountCents,
          discountCode: bill.dto.discountCode,
          serviceChargeCents: bill.dto.serviceChargeCents,
          taxCents: bill.dto.taxCents,
          totalCents: bill.dto.totalCents,
        },
        payment: {
          method: enums.paymentMethod.fromDb(payment.method),
          splitMode: enums.splitMode.fromDb(payment.splitMode),
          amountCents: payment.amountCents,
          tipCents: payment.tipCents,
          chargedCents: payment.amountCents + payment.tipCents,
        },
        paidToDateCents: bill.dto.paidCents,
        balanceAfterCents: bill.dto.balanceCents,
      };
      await tx.receipt.create({
        data: { paymentId, publicToken: newToken(24), snapshot: snapshot as unknown as Prisma.InputJsonValue },
      });
    }
    await audit(tx, {
      actor: opts.cashStaffId ? { type: "staff", staffId: opts.cashStaffId } : { type: "system" },
      action: outcome.status === "succeeded" ? "payment.succeeded" : "payment.failed",
      entityType: "payment",
      entityId: paymentId,
      data: outcome.status === "succeeded" ? { amountCents: payment.amountCents, tipCents: payment.tipCents } : { reason: outcome.reason },
      ip: opts.ip,
    });
    const version = await bumpVersion(tx, payment.sessionId);
    return { sessionId: payment.sessionId, version };
  });
  if (!settled) return;

  const { bill } = await publishMoney(db, realtime, settled.sessionId, paymentId, settled.version);
  if (outcome.status === "succeeded" && bill.totalCents > 0 && bill.balanceCents === 0 && bill.pendingCents === 0) {
    await closeSession(db, realtime, settled.sessionId, "PAID");
  } else {
    const s = await db.tableSession.findUniqueOrThrow({ where: { id: settled.sessionId }, select: { tableId: true } });
    await emitTableStatus(db, realtime, s.tableId);
  }
}

/** Waiter confirms they received cash for a pending payment. Also closes its call. */
export async function confirmCash(db: Db, realtime: Realtime, sessionId: string, paymentId: string, staffId: string, ip?: string) {
  const payment = await db.payment.findFirst({ where: { id: paymentId, sessionId }, include: { cashCall: true } });
  if (!payment) throw errors.notFound("Payment");
  if (payment.method !== "CASH") throw errors.badRequest("NOT_CASH", "Only cash payments are confirmed by staff.");
  if (payment.status !== "PENDING") throw errors.conflict("ALREADY_SETTLED", "This payment is already settled.");

  if (payment.cashCall && payment.cashCall.status === "OPEN") {
    const res = await db.waiterCall.updateMany({
      where: { id: payment.cashCall.id, status: "OPEN" },
      data: { status: "HANDLED", handledAt: new Date(), handledById: staffId },
    });
    if (res.count) {
      const call = await db.waiterCall.findUniqueOrThrow({ where: { id: payment.cashCall.id }, include: { table: { select: { number: true } } } });
      realtime.emit([rooms.session(sessionId), rooms.waiters], "call:updated", { call: toCallDTO(call) });
    }
  }
  await settlePayment(db, realtime, paymentId, { status: "succeeded", providerRef: null }, { cashStaffId: staffId, ip });
}
