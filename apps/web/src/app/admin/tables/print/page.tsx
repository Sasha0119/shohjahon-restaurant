"use client";

import { brand, localize } from "@app/config";
import type { AdminTableDTO } from "@app/shared/api";
import { ArrowLeft, Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";

/** Printable table cards (one per table, or a single one via ?table=<id>). Always light, for paper. */
export default function PrintQrPage() {
  return (
    <Suspense>
      <PrintQr />
    </Suspense>
  );
}

function PrintQr() {
  const { t, locale } = useI18n();
  const only = useSearchParams().get("table");
  const [tables, setTables] = useState<AdminTableDTO[] | null>(null);

  useEffect(() => {
    api<{ tables: AdminTableDTO[] }>("GET", "/api/admin/tables").then((r) =>
      setTables(r.tables.filter((x) => x.active && (!only || x.id === only))),
    );
  }, [only]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <LinkButton href="/admin/tables" variant="ghost">
          <ArrowLeft className="size-5" aria-hidden />
          {t("admin.tables.title")}
        </LinkButton>
        <Button onClick={() => window.print()} disabled={!tables}>
          <Printer className="size-5" aria-hidden />
          {t("admin.tables.print")}
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 print:mt-0 print:grid-cols-2 print:gap-0">
        {!tables
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[26rem] rounded-card" />)
          : tables.map((tb) => (
              <article
                key={tb.id}
                style={{ "--primary-color": "#8A6424" } as React.CSSProperties}
                className="relative flex break-inside-avoid flex-col items-center rounded-card bg-[#FBF8F2] p-8 text-center text-[#1d1a15] shadow-soft ring-1 ring-[#C9A45C]/40 print:rounded-none print:shadow-none print:ring-0 print:[break-inside:avoid]"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-3 rounded-[calc(var(--radius-card)-8px)] ring-1 ring-[#C9A45C]/45 print:rounded-none"
                />
                <Logo size={52} />
                <p className="mt-2 font-display text-2xl font-semibold tracking-wide">{brand.name}</p>
                <p className="mt-1 text-[10px] font-label uppercase tracking-[0.08em] text-[#8A6424]">
                  {localize(brand.tagline, locale)}
                </p>
                <div aria-hidden className="mt-4 flex items-center gap-2 text-[#C9A45C]">
                  <span className="h-px w-12 bg-current" />
                  <span className="size-1.5 rotate-45 bg-current" />
                  <span className="h-px w-12 bg-current" />
                </div>
                <p className="mt-3 font-display text-4xl font-semibold">
                  {t("admin.tables.table", { number: tb.number })}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image */}
                <img
                  src={`/api/admin/tables/${tb.id}/qr?size=640`}
                  alt={t("admin.tables.qr", { number: tb.number })}
                  width={240}
                  height={240}
                  className="mt-5 size-60 rounded-xl bg-white p-2 ring-1 ring-[#C9A45C]/40"
                />
                <p className="mt-4 text-xl font-semibold">{t("admin.tables.printTitle")}</p>
                <p className="mt-1 text-sm text-[#5a5348]">{t("admin.tables.printHint")}</p>
              </article>
            ))}
      </div>
    </div>
  );
}
