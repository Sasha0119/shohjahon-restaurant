"use client";

import type { ModifierSelection } from "@app/shared";
import type { BillDTO, CallDTO, CartLineDTO, OrderTicketDTO, SessionSnapshotDTO } from "@app/shared/api";
import { useCallback, useRef } from "react";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { ApiClientError, api } from "@/lib/api";
import { useMenuStore } from "@/store/menu-store";
import { useSessionStore } from "@/store/session-store";
import { useTableStore, type CallType } from "@/store/table-store";

type CartResponse = { version: number; cart: CartLineDTO[] };

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/**
 * Every guest action, talking to the server. Responses are applied to the
 * session store right away (the socket event for the same version is then
 * ignored), so the phone that acted never waits for the broadcast.
 */
export function useGuestActions() {
  const t = useT();
  const s = useSessionStore.getState;
  /** Reused across retries of the same "Send", so a flaky network can't double-order. */
  const sendKey = useRef<string | null>(null);

  const resync = useCallback(async () => {
    try {
      const { snapshot } = await api<{ snapshot: SessionSnapshotDTO }>("GET", "/api/session");
      s().applySnapshot(snapshot);
    } catch {
      /* the socket will resync on reconnect */
    }
  }, [s]);

  /** Turn an API error into a message for the guest (and refresh what's stale). */
  const explain = useCallback(
    (e: unknown) => {
      if (!(e instanceof ApiClientError)) return void toast.error(t("errors.generic"));
      const items = ((e.details as { items?: string[] })?.items ?? []).join(", ");
      switch (e.code) {
        case "OUT_OF_STOCK":
          void useMenuStore.getState().load();
          return void toast.error(t("errors.outOfStock", { items }));
        case "ITEM_UNAVAILABLE":
          void useMenuStore.getState().load();
          return void toast.error(t("errors.unavailable", { items }));
        case "INVALID_SELECTION":
          void useMenuStore.getState().load();
          return void toast.error(t("errors.invalidSelection"));
        case "CART_CHANGED":
          void resync();
          return void toast.info(t("errors.cartChanged"));
        case "TOO_LATE_TO_CANCEL":
          void resync();
          return void toast.error(t("errors.tooLate"));
        case "SESSION_CLOSED":
          return s().closed((e.details as { reason?: "paid" | "staff" | "expired" })?.reason ?? "expired");
        case "NETWORK":
          return void toast.error(t("errors.offline"));
        default:
          return void toast.error(translateError(e, t));
      }
    },
    [resync, s, t],
  );

  const applyCart = (r: CartResponse) => {
    if (s().applyCart(r.version, r.cart) === "resync") void resync();
  };

  const addToCart = useCallback(
    async (input: { itemId: string; quantity: number; selection: ModifierSelection; note?: string }) => {
      try {
        applyCart(await api<CartResponse>("POST", "/api/session/cart", input));
        return true;
      } catch (e) {
        explain(e);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [explain],
  );

  const setQuantity = useCallback(
    async (lineId: string, quantity: number) => {
      try {
        applyCart(
          quantity <= 0
            ? await api<CartResponse>("DELETE", `/api/session/cart/${lineId}`)
            : await api<CartResponse>("PATCH", `/api/session/cart/${lineId}`, { quantity: Math.min(99, quantity) }),
        );
      } catch (e) {
        explain(e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [explain],
  );

  const sendToKitchen = useCallback(async () => {
    const snap = s().snapshot;
    if (!snap) return false;
    sendKey.current ??= newKey();
    try {
      const res = await fetchWithKey(sendKey.current, snap.version);
      sendKey.current = null;
      if (
        s().applyCart(res.cartVersion, []) === "resync" ||
        s().applyOrdersCreated(res.version, res.tickets) === "resync"
      ) {
        void resync();
      }
      void api<{ bill: BillDTO }>("GET", "/api/session/bill")
        .then(({ bill }) => s().setBill(bill))
        .catch(() => {});
      return true;
    } catch (e) {
      // Keep the key only for network failures (a retry must be recognised as the same order).
      if (!(e instanceof ApiClientError && e.code === "NETWORK")) sendKey.current = null;
      explain(e);
      return false;
    }
  }, [explain, resync, s]);

  const cancelRound = useCallback(
    async (orderId: string) => {
      try {
        await api("POST", `/api/session/orders/${orderId}/cancel`);
        await resync();
        return true;
      } catch (e) {
        explain(e);
        return false;
      }
    },
    [explain, resync],
  );

  const callServer = useCallback(
    async (type: CallType): Promise<CallDTO | null> => {
      const { setCooldown } = useTableStore.getState();
      try {
        const res = await api<{ call: CallDTO; cooldownSeconds: number }>("POST", "/api/session/calls", { type });
        s().applyCall(res.call);
        setCooldown(type, Date.now() + res.cooldownSeconds * 1000);
        return res.call;
      } catch (e) {
        if (e instanceof ApiClientError && e.code === "CALL_COOLDOWN") {
          const secs = (e.details as { retryAfterSeconds?: number })?.retryAfterSeconds ?? 30;
          setCooldown(type, Date.now() + secs * 1000);
          toast.info(t("call.alreadyCalled"));
        } else explain(e);
        return null;
      }
    },
    [explain, s, t],
  );

  return { addToCart, setQuantity, sendToKitchen, cancelRound, callServer };
}

async function fetchWithKey(key: string, cartVersion: number) {
  let res: Response;
  try {
    res = await fetch("/api/session/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ cartVersion }),
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "offline");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiClientError(
      res.status,
      data?.error?.code ?? "HTTP_ERROR",
      data?.error?.message ?? "",
      data?.error?.details,
    );
  return data as { cartVersion: number; version: number; tickets: OrderTicketDTO[] };
}
