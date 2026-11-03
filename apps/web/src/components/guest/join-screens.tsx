"use client";

import { brand } from "@app/config";
import { motion } from "framer-motion";
import { ArrowLeftRight, CloudOff, Heart, Loader2, QrCode, ReceiptText, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { JoinPhase } from "@/store/session-store";
import { useSessionStore } from "@/store/session-store";
import { useTableStore } from "@/store/table-store";
import { RatingPanel } from "./rating-panel";

/** Full-screen state shown instead of the guest app while joining or when something needs attention. */
function Screen({ icon: Icon, title, body, children, tone = "primary" }: {
  icon: LucideIcon;
  title: string;
  body?: string;
  children?: ReactNode;
  tone?: "primary" | "muted";
}) {
  return (
    <main className="relative isolate flex min-h-svh flex-col items-center px-6 py-12 text-center">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50rem 30rem at 50% -10%, color-mix(in oklab, var(--primary-color) 16%, transparent), transparent 70%)",
        }}
      />
      <div className="flex items-center gap-2.5">
        <Logo size={36} />
        <span className="font-display text-lg font-semibold">{brand.name}</span>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="my-auto flex w-full max-w-sm flex-col items-center"
      >
        <div className="relative mb-7">
          <div className="absolute inset-0 scale-150 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div
            className={
              tone === "primary"
                ? "relative grid size-20 place-items-center rounded-[1.75rem] bg-primary text-on-primary shadow-glow"
                : "relative grid size-20 place-items-center rounded-[1.75rem] bg-surface text-primary shadow-soft ring-1 ring-line/70"
            }
          >
            <Icon className="size-9" strokeWidth={1.7} aria-hidden />
          </div>
        </div>
        <h1 className="text-[1.75rem] font-semibold leading-tight">{title}</h1>
        {body && <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{body}</p>}
        {children && <div className="mt-8 flex w-full flex-col gap-3">{children}</div>}
      </motion.div>
    </main>
  );
}

export function JoinScreen({
  phase,
  onJoin,
}: {
  phase: Exclude<JoinPhase, { kind: "ready" }>;
  onJoin: (answers?: { confirmJoin?: boolean; confirmSwitch?: boolean }) => void;
}) {
  const t = useT();
  const receiptToken = useTableStore((s) => s.lastReceiptToken);
  const sessionId = useSessionStore((s) => s.snapshot?.sessionId);

  switch (phase.kind) {
    case "joining":
      return (
        <main className="grid min-h-svh place-items-center" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-5">
            <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
              <Logo size={64} />
            </motion.div>
            <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("join.connecting")}
            </p>
          </div>
        </main>
      );
    case "occupied":
      return (
        <Screen
          icon={Users}
          title={t("join.occupiedTitle", { table: phase.table })}
          body={t("join.occupiedBody", { count: phase.guestCount })}
        >
          <Button size="lg" onClick={() => onJoin({ confirmJoin: true })}>
            {t("join.occupiedJoin")}
          </Button>
          <p className="text-sm text-fg-muted">{t("join.occupiedNotWithThem")}</p>
        </Screen>
      );
    case "otherTable":
      return (
        <Screen
          icon={ArrowLeftRight}
          title={t("join.otherTitle", { current: phase.currentTable })}
          body={t("join.otherBody", { next: phase.newTable })}
        >
          <Button size="lg" onClick={() => onJoin({ confirmSwitch: true })}>
            {t("join.otherSwitch", { next: phase.newTable })}
          </Button>
          <p className="text-sm text-fg-muted">{t("join.otherStay", { current: phase.currentTable })}</p>
        </Screen>
      );
    case "invalid":
      return <Screen icon={QrCode} tone="muted" title={t("join.invalidTitle")} body={t("join.invalidBody")} />;
    case "replaced":
      return <Screen icon={QrCode} tone="muted" title={t("join.replacedTitle")} body={t("join.replacedBody")} />;
    case "unavailable":
      return <Screen icon={QrCode} tone="muted" title={t("join.unavailableTitle")} body={t("join.unavailableBody")} />;
    case "closed":
      return phase.reason === "paid" ? (
        <Screen icon={Heart} title={t("join.closedPaidTitle")} body={t("join.closedPaidBody")}>
          {sessionId && <RatingPanel sessionId={sessionId} className="mb-2" />}
          {receiptToken && (
            <Link
              href={`/receipt/${receiptToken}`}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary shadow-glow"
            >
              <ReceiptText className="size-5" aria-hidden />
              {t("join.viewReceipt")}
            </Link>
          )}
          <Button size="lg" variant="secondary" onClick={() => onJoin()}>
            {t("join.startNew")}
          </Button>
        </Screen>
      ) : (
        <Screen icon={QrCode} tone="muted" title={t("join.closedTitle")} body={t("join.closedBody")}>
          <Button size="lg" onClick={() => onJoin()}>
            {t("join.startNew")}
          </Button>
        </Screen>
      );
    case "error":
      return (
        <Screen icon={CloudOff} tone="muted" title={t("join.errorTitle")} body={t("join.errorBody")}>
          <Button size="lg" onClick={() => onJoin()}>
            {t("common.retry")}
          </Button>
        </Screen>
      );
  }
}
