"use client";

import { brand } from "@app/config";
import { motion } from "framer-motion";
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
import { Logo } from "@/components/brand/logo";
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

  const nav = (
    <ul className="space-y-1">
      {NAV.map(({ href, key, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
                active ? "text-primary" : "text-fg-muted hover:bg-muted hover:text-fg",
              )}
            >
              {active && (
                <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-xl bg-primary/10" aria-hidden />
              )}
              <Icon className="relative size-5" aria-hidden />
              <span className="relative">{t(`admin.nav.${key}`)}</span>
              {key === "feedback" && newFeedback > 0 && (
                <span
                  className="relative ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white tabular"
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
    <div className="min-h-svh md:grid md:grid-cols-[16rem_1fr] print:block">
      {/* Sidebar (tablet / desktop) */}
      <aside className="sticky top-0 hidden h-svh print:!hidden flex-col border-r border-line/60 bg-surface px-4 py-5 md:flex">
        <div className="flex items-center gap-3 px-1">
          <Logo size={40} />
          <div className="min-w-0">
            <p className="line-clamp-2 font-display text-lg font-semibold leading-tight">{brand.name}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("admin.title")}</p>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
        <nav className="mt-8 flex-1" aria-label={t("admin.title")}>
          {nav}
        </nav>
        <div className="flex items-center gap-2 rounded-2xl bg-muted/60 p-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-on-primary" aria-hidden>
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
      <header className="sticky top-0 z-20 border-b border-line/60 glass md:hidden print:hidden">
        <div className="flex h-16 items-center gap-3 px-4">
          <Logo size={36} />
          <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{brand.name}</p>
          <ThemeToggle />
          <IconButton label={t("staff.signOut")} onClick={signOut}>
            <LogOut className="size-5" aria-hidden />
          </IconButton>
        </div>
        <nav className="no-scrollbar overflow-x-auto px-3 pb-2" aria-label={t("admin.title")}>
          <div className="flex gap-1 [&_ul]:flex [&_ul]:gap-1 [&_ul]:space-y-0">{nav}</div>
        </nav>
      </header>

      <main className="min-w-0 px-4 py-6 md:px-10 md:py-10 print:p-0">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
