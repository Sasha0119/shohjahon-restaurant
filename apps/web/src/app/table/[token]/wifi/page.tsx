"use client";

import { brand } from "@app/config";
import { wifiQrPayload } from "@app/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, KeyRound, ScanLine, Wifi } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { PageHeader } from "@/components/guest/page-header";
import { haptic } from "@/components/guest/use-quick-add";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";

/**
 * Wi-Fi details. Browsers cannot join a network on the guest's behalf, so we
 * offer copy buttons and a standard Wi-Fi QR code for the phone camera.
 */
export default function WifiPage() {
  const t = useT();
  const { wifi } = brand;
  const open = wifi.security === "nopass";

  return (
    <main>
      <PageHeader title={t("wifi.title")} subtitle={t("wifi.subtitle")} />

      <div className="space-y-4 px-4 pt-5">
        <section className="relative overflow-hidden rounded-card bg-primary p-6 text-on-primary shadow-glow">
          <div aria-hidden className="absolute -right-10 -top-12 size-48 rounded-full bg-on-primary/10" />
          <div aria-hidden className="absolute -bottom-16 right-12 size-40 rounded-full bg-on-primary/5" />
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
            className="relative grid size-14 place-items-center rounded-2xl bg-on-primary/15"
          >
            <Wifi className="size-7" aria-hidden />
          </motion.div>
          <p className="relative mt-5 text-sm font-semibold uppercase tracking-[0.16em] opacity-80">
            {t("wifi.network")}
          </p>
          <p className="relative mt-1 break-all font-display text-[1.75rem] font-semibold leading-tight">{wifi.ssid}</p>
        </section>

        <section className="divide-y divide-line/70 overflow-hidden rounded-card bg-surface shadow-soft ring-1 ring-line/60">
          <CopyRow icon={Wifi} label={t("wifi.network")} value={wifi.ssid} />
          {open ? (
            <div className="flex min-h-16 items-center gap-3.5 px-5 py-4">
              <KeyRound className="size-5 text-fg-muted" aria-hidden />
              <p className="font-medium">{t("wifi.noPassword")}</p>
            </div>
          ) : (
            <CopyRow icon={KeyRound} label={t("wifi.password")} value={wifi.password} mono />
          )}
        </section>

        <section
          aria-labelledby="wifi-qr"
          className="flex flex-col items-center rounded-card bg-surface p-6 text-center shadow-soft ring-1 ring-line/60"
        >
          <h2 id="wifi-qr" className="flex items-center gap-2 text-lg font-semibold">
            <ScanLine className="size-5 text-primary" aria-hidden />
            {t("wifi.scan")}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{t("wifi.scanHint")}</p>
          {/* QR codes need dark-on-light to scan reliably, so the tile is always white. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="mt-5 rounded-3xl bg-white p-5 shadow-soft ring-1 ring-black/5"
          >
            <QRCodeSVG
              value={wifiQrPayload(wifi)}
              size={208}
              level="M"
              marginSize={0}
              bgColor="#FFFFFF"
              fgColor="#111111"
              title={`${t("wifi.network")}: ${wifi.ssid}`}
            />
          </motion.div>
          <p className="mt-5 max-w-xs text-sm text-fg-muted">{t("wifi.manualHint")}</p>
        </section>
      </div>
    </main>
  );
}

function CopyRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  mono?: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      haptic();
      toast.success(t("wifi.copied", { label }));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("wifi.copyFailed"));
    }
  };

  return (
    <div className="flex min-h-[4.5rem] items-center gap-3.5 px-5 py-3">
      <Icon className="size-5 shrink-0 text-fg-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</p>
        <p className={mono ? "select-all break-all font-mono text-[17px] font-semibold" : "select-all break-all text-[17px] font-semibold"}>
          {value}
        </p>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={copy}
        aria-label={t("wifi.copy", { label })}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary/12 px-4 text-sm font-semibold text-primary"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? "y" : "n"}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="grid place-items-center"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
