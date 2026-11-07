import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Card / wallet payments go through this interface. The app ships with a mock
 * provider (no real money). A Stripe adapter implements the same three
 * methods — the routes, database and UI don't change:
 *
 *  • charge()        → create + confirm a PaymentIntent (idempotency key = our payment id)
 *  • parseWebhook()  → verify the Stripe-Signature header, map the event
 *  • name            → stored on each payment ("stripe")
 */
interface ChargeRequest {
  /** Our payment id — also the provider idempotency key, so a retry never charges twice. */
  paymentId: string;
  /** Amount + tip, in minor units. */
  amountCents: number;
  currency: string;
  method: "card" | "applePay" | "googlePay";
  description: string;
}

export type ChargeOutcome =
  | { status: "succeeded"; providerRef: string | null }
  | { status: "failed"; providerRef: string | null; reason: string };

interface WebhookEvent {
  paymentId: string;
  outcome: ChargeOutcome;
}

export interface PaymentProvider {
  name: string;
  charge(req: ChargeRequest): Promise<ChargeOutcome>;
  /** Refund part of an earlier charge. Must be safe to repeat for the same payment id. Throws on failure. */
  refund(req: { paymentId: string; providerRef: string | null; amountCents: number; currency: string }): Promise<void>;
  /** Verify and parse a webhook. Throws if the signature is invalid. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent;
}

/**
 * Mock provider for development, demos and tests.
 *  • Charges succeed immediately …
 *  • … except totals ending in 13 cents (e.g. $20.13), which are declined —
 *    handy for testing the "payment failed" flow.
 *  • Idempotent: charging the same payment id twice returns the first outcome.
 *  • Webhooks are signed with HMAC-SHA256 in the `x-mock-signature` header.
 */
export function createMockProvider(webhookSecret: string): PaymentProvider {
  const outcomes = new Map<string, ChargeOutcome>();
  return {
    name: "mock",
    async refund() {
      // No real money moved, so there's nothing to send back: the refund is only recorded.
    },
    async charge(req) {
      const known = outcomes.get(req.paymentId);
      if (known) return known;
      const outcome: ChargeOutcome =
        req.amountCents % 100 === 13
          ? { status: "failed", providerRef: `mock_${req.paymentId}`, reason: "card_declined" }
          : { status: "succeeded", providerRef: `mock_${req.paymentId}` };
      outcomes.set(req.paymentId, outcome);
      return outcome;
    },
    parseWebhook(rawBody, headers) {
      const sig = headers["x-mock-signature"];
      const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      if (
        typeof sig !== "string" ||
        sig.length !== expected.length ||
        !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
      ) {
        throw new Error("Invalid webhook signature");
      }
      const body = JSON.parse(rawBody.toString("utf8")) as { paymentId?: string; status?: string; reason?: string };
      if (!body.paymentId || (body.status !== "succeeded" && body.status !== "failed"))
        throw new Error("Malformed webhook");
      return {
        paymentId: body.paymentId,
        outcome:
          body.status === "succeeded"
            ? { status: "succeeded", providerRef: `mock_${body.paymentId}` }
            : { status: "failed", providerRef: `mock_${body.paymentId}`, reason: body.reason ?? "declined" },
      };
    },
  };
}

/** Sign a mock webhook body (used by tests and local tools). */
export function signMockWebhook(webhookSecret: string, body: string): string {
  return createHmac("sha256", webhookSecret).update(body).digest("hex");
}

/** Webhook secret for the mock provider, derived from COOKIE_SECRET (no extra setting needed). */
export function mockWebhookSecret(cookieSecret: string): string {
  return createHmac("sha256", cookieSecret).update("mock-payment-webhook").digest("hex");
}
