import { brand } from "@app/config";
import { applyPercent, formatMoney } from "@app/shared";
import {
  applyDiscountBody,
  billQuery,
  confirmCashBody,
  createPaymentBody,
  discountCodeInput,
  discountUpdateBody,
  emailReceiptBody,
  zId,
  type ReceiptDTO,
} from "@app/shared/api";
import type { RequestHandler } from "express";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { ApiError, errors, parse } from "../http/errors.ts";
import { idempotent } from "../http/idempotency.ts";
import type { createRegistrar } from "../http/registrar.ts";
import type { Realtime } from "../realtime/types.ts";
import { computeSessionBill } from "./bill.ts";
import { applyDiscount, removeDiscount, toDiscountDTO } from "./discounts.ts";
import { escapeHtml, type Mailer } from "./mailer.ts";
import { chargePending, confirmCash, publishStarted, settlePayment, startPayment, toPaymentDTO } from "./payments.ts";
import type { PaymentProvider } from "./provider.ts";

type On = ReturnType<typeof createRegistrar>["on"];
const zReceiptToken = z
  .string()
  .min(20)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const money = (c: number) => formatMoney(c, brand.currency.code, brand.currency.locale);

export function registerBillingRoutes(
  on: On,
  db: Db,
  realtime: Realtime,
  provider: PaymentProvider,
  mailer: Mailer | null,
) {
  // ── bill & discount ───────────────────────────────────────────────────────
  on("GET", "/api/session/bill", async (req, res) => {
    const q = parse(billQuery, req.query);
    const bill = await computeSessionBill(db, req.guest!.sessionId);
    const net = bill.dto.subtotalCents - bill.dto.comboDiscountCents - bill.dto.codeDiscountCents;
    const tipPreviewCents = q.tipCents ?? (q.tipPercent ? applyPercent(net, q.tipPercent) : 0);
    res.json({ bill: bill.dto, tipPreviewCents });
  });

  on("POST", "/api/session/discount", async (req, res) => {
    const { code } = parse(applyDiscountBody, req.body);
    res.json(await applyDiscount(db, realtime, req.guest!, code));
  });

  on("DELETE", "/api/session/discount", async (req, res) => {
    res.json(await removeDiscount(db, realtime, req.guest!));
  });

  // ── payments ──────────────────────────────────────────────────────────────
  on("POST", "/api/session/payments", async (req, res) => {
    const guest = req.guest!;
    const input = parse(createPaymentBody, req.body);
    let started = null as Awaited<ReturnType<typeof startPayment>> | null;
    const key = String(req.get("Idempotency-Key") ?? "");
    const result = await idempotent(db, req, "payment.create", guest.id, async (tx) => {
      started = await startPayment(tx, guest, input, `${guest.id}:${key}`, provider.name);
      return { status: 201, body: { paymentId: started.paymentId } };
    });
    const paymentId = (result.body as { paymentId: string }).paymentId;
    if (started) await publishStarted(db, realtime, guest.sessionId, started);
    // Charge (or re-check, on a retried request) — the provider is idempotent on our payment id.
    await chargePending(db, realtime, provider, paymentId);
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { receipt: { select: { publicToken: true } } },
    });
    res
      .status(result.status)
      .json({ payment: toPaymentDTO(payment), bill: (await computeSessionBill(db, guest.sessionId)).dto });
  });

  on("GET", "/api/session/payments/:paymentId", async (req, res) => {
    const id = parse(zId, req.params.paymentId);
    const payment = await db.payment.findFirst({
      where: { id, sessionId: req.guest!.sessionId },
      include: { receipt: { select: { publicToken: true } } },
    });
    if (!payment) throw errors.notFound("Payment");
    res.json({ payment: toPaymentDTO(payment) });
  });

  on("POST", "/api/payments/webhook/:provider", async (req, res) => {
    if (req.params.provider !== provider.name) throw errors.notFound("Payment provider");
    if (!Buffer.isBuffer(req.body)) throw errors.badRequest("INVALID_WEBHOOK", "Expected a raw body.");
    let event;
    try {
      event = provider.parseWebhook(req.body, req.headers);
    } catch {
      throw new ApiError(400, "INVALID_WEBHOOK", "Invalid webhook signature.");
    }
    const exists = await db.payment.findUnique({ where: { id: event.paymentId }, select: { id: true } });
    if (exists) await settlePayment(db, realtime, event.paymentId, event.outcome);
    res.json({ received: true }); // always 2xx for valid signatures, so the provider stops retrying
  });

  on("POST", "/api/waiter/sessions/:sessionId/cash", async (req, res) => {
    const sessionId = parse(zId, req.params.sessionId);
    const { paymentId } = parse(confirmCashBody, req.body);
    await confirmCash(db, realtime, sessionId, paymentId, req.staff!.id, req.ip);
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { receipt: { select: { publicToken: true } } },
    });
    res.json({ payment: toPaymentDTO(payment) });
  });

  // ── receipts ──────────────────────────────────────────────────────────────
  const loadReceipt = async (rawToken: unknown) => {
    const token = parse(zReceiptToken, rawToken);
    const r = await db.receipt.findUnique({ where: { publicToken: token } });
    if (!r) throw errors.notFound("Receipt");
    return r;
  };
  const receiptDTO = (r: Awaited<ReturnType<typeof loadReceipt>>): ReceiptDTO => ({
    ...(r.snapshot as unknown as Omit<ReceiptDTO, "number" | "issuedAt" | "emailedTo">),
    number: r.number,
    issuedAt: r.createdAt.toISOString(),
    emailedTo: r.emailedTo ? r.emailedTo.replace(/^(.).*(@.*)$/, "$1•••$2") : null,
  });
  const noIndex: RequestHandler = (_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex");
    res.setHeader("Cache-Control", "private, no-store");
    next();
  };

  on("GET", "/api/receipts/:publicToken", noIndex, async (req, res) => {
    res.json({ receipt: receiptDTO(await loadReceipt(req.params.publicToken)) });
  });

  on("POST", "/api/receipts/:publicToken/email", async (req, res) => {
    const r = await loadReceipt(req.params.publicToken);
    const { email } = parse(emailReceiptBody, req.body);
    if (!mailer) throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Email receipts aren't available here yet.");
    if (r.emailedAt && Date.now() - r.emailedAt.getTime() < 60_000) {
      throw new ApiError(429, "RATE_LIMITED", "Please wait a minute before sending this receipt again.");
    }
    const receipt = receiptDTO(r);
    const rows = receipt.lines.map(
      (l) =>
        `${l.quantity}× ${l.name}${l.options.length ? ` (${l.options.join(", ")})` : ""} — ${money(l.unitPriceCents * l.quantity)}`,
    );
    const text = [
      `${brand.name} — receipt #${receipt.number}`,
      `Table ${receipt.tableNumber} · ${new Date(receipt.issuedAt).toLocaleString(brand.currency.locale, { timeZone: brand.timezone })}`,
      "",
      ...rows,
      "",
      `Total: ${money(receipt.bill.totalCents)}`,
      `You paid: ${money(receipt.payment.amountCents)} + tip ${money(receipt.payment.tipCents)} = ${money(receipt.payment.chargedCents)}`,
    ].join("\n");
    const html = `<h2>${escapeHtml(brand.name)}</h2><p>Receipt #${receipt.number} · Table ${receipt.tableNumber}</p><ul>${rows
      .map((x) => `<li>${escapeHtml(x)}</li>`)
      .join("")}</ul><p><strong>Total ${escapeHtml(money(receipt.bill.totalCents))}</strong><br>You paid ${escapeHtml(
      money(receipt.payment.chargedCents),
    )} (incl. tip ${escapeHtml(money(receipt.payment.tipCents))})</p>`;
    try {
      await mailer.send({ to: email, subject: `${brand.name} — receipt #${receipt.number}`, text, html });
    } catch {
      throw new ApiError(502, "EMAIL_FAILED", "We couldn't send the email. Please try again later.");
    }
    await db.receipt.update({ where: { id: r.id }, data: { emailedTo: email, emailedAt: new Date() } });
    res.json({ sent: true });
  });

  // ── admin: discount codes ─────────────────────────────────────────────────
  on("GET", "/api/admin/discounts", async (_req, res) => {
    const codes = await db.discountCode.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
    res.json({ discounts: codes.map(toDiscountDTO) });
  });

  on("POST", "/api/admin/discounts", async (req, res) => {
    const input = parse(discountCodeInput, req.body);
    try {
      const d = await db.discountCode.create({
        data: {
          code: input.code,
          kind: input.kind === "percent" ? "PERCENT" : "FIXED",
          value: input.kind === "percent" ? Math.round(input.value * 100) : input.value,
          active: input.active,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          maxRedemptions: input.maxRedemptions ?? null,
          minSubtotalCents: input.minSubtotalCents ?? null,
          createdById: req.staff!.id,
        },
      });
      await audit(db, {
        actor: { type: "staff", staffId: req.staff!.id },
        action: "discount.created",
        entityType: "discount_code",
        entityId: d.id,
        data: { code: d.code },
        ip: req.ip,
      });
      res.status(201).json({ discount: toDiscountDTO(d) });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw errors.conflict("CODE_TAKEN", "That code already exists.");
      throw e;
    }
  });

  on("PATCH", "/api/admin/discounts/:discountId", async (req, res) => {
    const id = parse(zId, req.params.discountId);
    const { active } = parse(discountUpdateBody, req.body);
    const found = await db.discountCode.findUnique({ where: { id } });
    if (!found) throw errors.notFound("Discount code");
    const d = await db.discountCode.update({ where: { id }, data: { active } });
    await audit(db, {
      actor: { type: "staff", staffId: req.staff!.id },
      action: "discount.updated",
      entityType: "discount_code",
      entityId: id,
      data: { active },
      ip: req.ip,
    });
    res.json({ discount: toDiscountDTO(d) });
  });
}
