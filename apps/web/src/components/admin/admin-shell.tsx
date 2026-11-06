"use client";

import { brand } from "@app/config";
import {
  BookOpen,
  ChartColumn,
  LayoutGrid,
  LogOut,
  MessageSquareWarning,
  ReceiptText,
  ScrollText,
  TicketPercent,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Logo, Wordmark } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { useStaffSession } from "@/components/staff/staff-session";
import { IconButton } from "@/components/ui/button";
import { useStaffSocket } from "@/hooks/use-staff-socket";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Admin sections. */
const NAV: { href: string; key: "overview" | "tables" | "orders" | "menu" | "discounts" | "feedback" | "audit" | "staff"; icon: LucideIcon }[] = [
  { href: "/admin/overview", key: "overview", icon: ChartColumn },
  { href: "/admin/tables", key: "tables", icon: LayoutGrid },
  { href: "/admin/orders", key: "orders", icon: ReceiptText },
  { href: "/admin/menu", key: "menu", icon: BookOpen },
  { href: "/admin/discounts", key: "discounts", icon: TicketPercent },
  { href: "/admin/feedback", key: "feedback", icon: MessageSquareWarning },
  { href: "/admin/audit", key: "audit", icon: ScrollText },
  { href: "/admin/staff", key: "staff", icon: Users },
];

/** Count of unhandled private feedback, kept live for the nav badge. */
function useNewFeedbackCount(): number {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    api<{ counts: { new: number } }>("GET", "/api/admin/feedback?status=new")
      .then((r) => setCount(r.counts.new))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("feedback-count-changed", load);
    return () => window.removeEventListener("feedback-count-changed", load);
  }, [load]);
  useStaffSocket({ "feedback:created": () => setCount((c) => c + 1) }, load);
  return count;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const { me, signOut } = useStaffSession();
  const newFeedback = useNewFeedbackCount();

  /** `rail`: icons only (tablet sidebar); the label stays as the accessible name and tooltip. */
  const navList = (rail: boolean) => (
    <ul className="space-y-1">
      {NAV.map(({ href, key, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              title={rail ? t(`admin.nav.${key}`) : undefined}
              className={cn(
                "pressable relative flex items-center gap-3 whitespace-nowrap rounded-xl text-[15px] font-semibold transition-colors",
                rail ? "size-12 justify-center" : "h-11 px-3",
                active ? "text-primary" : "text-fg-muted hover:bg-muted hover:text-fg",
              )}
            >
              {active && (
                <span
                  className="absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-inset ring-gold-line"
                  aria-hidden
                />
              )}
              <Icon className="relative size-5" aria-hidden />
              <span className={cn("relative", rail && "sr-only")}>{t(`admin.nav.${key}`)}</span>
              {key === "feedback" && newFeedback > 0 && (
                <span
                  className={cn(
                    "relative grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white tabular",
                    rail ? "absolute -right-1 -top-1" : "ml-auto",
                  )}
                  aria-label={t("admin.feedback.newCount", { count: newFeedback })}
                >
                  {newFeedback}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-svh md:grid md:grid-cols-[5rem_minmax(0,1fr)] lg:grid-cols-[17rem_minmax(0,1fr)] print:block">
      {/* Tablet (md): slim icon rail */}
      <aside className="glass sticky top-0 hidden h-svh flex-col items-center border-r border-gold-line/60 py-4 md:flex lg:hidden print:!hidden">
        <Logo size={36} />
        <nav className="no-scrollbar mt-5 flex-1 overflow-y-auto px-2" aria-label={t("admin.title")}>
          {navList(true)}
        </nav>
        <div className="mt-3 flex flex-col items-center gap-2">
          <LanguageSwitcher placement="above-start" />
          <ThemeToggle />
          <IconButton label={t("staff.signOut")} onClick={signOut}>
            <LogOut className="size-5" aria-hidden />
          </IconButton>
        </div>
      </aside>

      {/* Desktop (lg+): full sidebar */}
      <aside className="glass sticky top-0 hidden h-svh print:!hidden flex-col border-r border-gold-line/60 px-4 py-6 lg:flex">
        <div className="px-2">
          <Wordmark size={40} />
          <p className="eyebrow mt-3">{t("admin.title")}</p>
          <span aria-hidden className="gold-rule mt-4 block w-full opacity-70" />
        </div>
        <nav className="no-scrollbar mt-5 flex-1 overflow-y-auto" aria-label={t("admin.title")}>
          {navList(false)}
        </nav>
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <LanguageSwitcher placement="above-start" />
          <ThemeToggle />
        </div>
        <div className="glass-chip flex items-center gap-2 rounded-2xl p-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-display text-sm font-semibold text-on-primary" aria-hidden>
            {me.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{me.name}</p>
            <p className="text-xs text-fg-muted">{t("staff.roles.manager")}</p>
          </div>
          <IconButton label={t("staff.signOut")} onClick={signOut}>
            <LogOut className="size-5" aria-hidden />
          </IconButton>
        </div>
      </aside>

      {/* Top bar (phone) */}
      <header className="sticky top-0 z-20 border-b border-gold-line/60 glass md:hidden print:hidden">
        <div className="flex h-16 items-center gap-2 px-4">
          <Logo size={34} />
          {/* Tighter than the sidebar wordmark so the full name fits beside the buttons on a phone. */}
          <p className="min-w-0 flex-1 truncate font-display text-base font-label uppercase tracking-[0.08em]">{brand.name}</p>
          <LanguageSwitcher />
          <ThemeToggle />
          <IconButton label={t("staff.signOut")} onClick={signOut}>
            <LogOut className="size-5" aria-hidden />
          </IconButton>
        </div>
        <nav className="no-scrollbar overflow-x-auto px-3 pb-2" aria-label={t("admin.title")}>
          <div className="flex gap-1 [&_ul]:flex [&_ul]:gap-1 [&_ul]:space-y-0">{navList(false)}</div>
        </nav>
      </header>

      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8 xl:px-10 xl:py-10 print:p-0">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
