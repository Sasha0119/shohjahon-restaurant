import { brand } from "@app/config";
import { applyCombos, codeDiscount, computeBill } from "@app/shared";
import type { BillDTO } from "@app/shared/api";
import type { Db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";

type Tx = Prisma.TransactionClient;

export interface SessionBill {
  dto: BillDTO;
  /** Items subtotal before any discount (base for "split by item"). */
  subtotal: number;
  total: number;
  outstanding: number;
  claimed: Set<string>;
  lines: { id: string; itemId: string; name: string; quantity: number; unitPriceCents: number; options: string[] }[];
}

/**
 * The authoritative bill for a session, from the database:
 *   subtotal − combo savings − discount code = net
 *   + service charge + tax = total            (tips are per payment, on top)
 *   paid = confirmed payments, pending = started but unconfirmed
 *   outstanding = total − paid − pending      (what can be paid right now)
 */
export async function computeSessionBill(db: Db | Tx, sessionId: string): Promise<SessionBill> {
  const [items, combos, payments, session] = await Promise.all([
    db.orderItem.findMany({
      where: { order: { sessionId, status: { not: "CANCELLED" } } },
      // Natural reading order: by round, food (kitchen) before drinks (bar), then as ordered.
      orderBy: [{ order: { round: "asc" } }, { order: { station: "asc" } }, { createdAt: "asc" }],
      include: { modifiers: { select: { optionName: true } } },
    }),
    db.comboDeal.findMany({ where: { active: true }, include: { items: true }, orderBy: { sortOrder: "asc" } }),
    db.payment.findMany({
      where: { sessionId, status: { in: ["SUCCEEDED", "PENDING"] } },
      select: { status: true, amountCents: true, tipCents: true, items: { select: { orderItemId: true } } },
    }),
    db.tableSession.findUniqueOrThrow({ where: { id: sessionId }, include: { discountCode: true } }),
  ]);

  const quantities = new Map<string, number>();
  for (const l of items) quantities.set(l.itemId, (quantities.get(l.itemId) ?? 0) + l.quantity);
  const combo = applyCombos(
    quantities,
    combos.map((c) => ({ id: c.id, kind: "combo" as const, name: c.name, itemIds: c.items.map((i) => i.itemId), discount: c.discountCents })),
  );

  const subtotal = items.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const comboDiscount = Math.min(combo.discount, subtotal);
  const code = session.discountCode;
  const codeQualifies = !!code && (code.minSubtotalCents == null || subtotal >= code.minSubtotalCents);
  const codeOff = code && codeQualifies ? codeDiscount(code.kind === "PERCENT" ? "percent" : "fixed", code.value, subtotal - comboDiscount) : 0;

  const bill = computeBill({
    lineTotals: items.map((l) => l.unitPriceCents * l.quantity),
    discount: comboDiscount + codeOff,
    taxPercent: brand.taxPercent,
    serviceChargePercent: brand.serviceChargePercent,
  });

  const paid = payments.filter((p) => p.status === "SUCCEEDED");
  const pending = payments.filter((p) => p.status === "PENDING");
  const paidCents = paid.reduce((n, p) => n + p.amountCents, 0);
  const pendingCents = pending.reduce((n, p) => n + p.amountCents, 0);
  const balance = Math.max(0, bill.total - paidCents);
  const outstanding = Math.max(0, balance - pendingCents);
  const claimed = new Set(payments.flatMap((p) => p.items.map((i) => i.orderItemId)));

  return {
    subtotal: bill.subtotal,
    total: bill.total,
    outstanding,
    claimed,
    lines: items.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      name: l.name,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      options: l.modifiers.map((m) => m.optionName),
    })),
    dto: {
      subtotalCents: bill.subtotal,
      comboDiscountCents: comboDiscount,
      codeDiscountCents: codeOff,
      discountCode: code?.code ?? null,
      serviceChargeCents: bill.serviceCharge,
      taxCents: bill.tax,
      totalCents: bill.total,
      paidCents,
      tipsPaidCents: paid.reduce((n, p) => n + p.tipCents, 0),
      balanceCents: balance,
      pendingCents,
      outstandingCents: outstanding,
      claimedOrderItemIds: [...claimed],
    },
  };
}
