"use client";

import { brand } from "@app/config";
import { wifiQrPayload } from "@app/shared";
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

      {/* A single short card: keep it at a readable width on big screens. */}
      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-5 lg:pt-8">
        <section className="card relative overflow-hidden p-6 ring-1 ring-gold-line">
          <div aria-hidden className="absolute -right-12 -top-14 size-52 rounded-full border border-gold-line" />
          <div aria-hidden className="absolute -right-4 -top-6 size-36 rounded-full border border-gold-line/60" />
          <div className="enter relative grid size-14 place-items-center rounded-full text-primary ring-1 ring-gold-line">
            <Wifi className="size-7" strokeWidth={1.6} aria-hidden />
          </div>
          <p className="eyebrow relative mt-5">{t("wifi.network")}</p>
          <p className="relative mt-1.5 break-all font-display text-[2rem] font-semibold leading-tight">{wifi.ssid}</p>
          <span aria-hidden className="gold-rule relative mt-4 block w-24" />
        </section>

        <section className="card divide-y divide-line overflow-hidden">
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

        <section aria-labelledby="wifi-qr" className="card flex flex-col items-center p-6 text-center">
          <h2 id="wifi-qr" className="flex items-center gap-2 font-display text-xl font-semibold">
            <ScanLine className="size-5 text-primary" aria-hidden />
            {t("wifi.scan")}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{t("wifi.scanHint")}</p>
          {/* QR codes need dark-on-light to scan reliably, so the tile is always white. */}
          <div className="enter mt-5 rounded-3xl bg-white p-5 shadow-soft ring-4 ring-gold-line">
            <QRCodeSVG
              value={wifiQrPayload(wifi)}
              size={208}
              level="M"
              marginSize={0}
              bgColor="#FFFFFF"
              fgColor="#111111"
              title={`${t("wifi.network")}: ${wifi.ssid}`}
            />
          </div>
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
      <Icon className="size-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-label uppercase tracking-[0.08em] text-fg-muted">{label}</p>
        <p
          className={
            mono
              ? "select-all break-all font-mono text-[17px] font-semibold"
              : "select-all break-all text-[17px] font-semibold"
          }
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={t("wifi.copy", { label })}
        className="pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary ring-1 ring-gold-line hover:bg-primary/10"
      >
        <>
          <span key={copied ? "y" : "n"} className="enter grid place-items-center">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </span>
        </>
      </button>
    </div>
  );
}
