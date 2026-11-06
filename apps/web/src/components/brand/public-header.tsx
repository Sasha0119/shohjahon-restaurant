"use client";

import { brand } from "@app/config";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { CurtainLink } from "@/components/ui/page-curtain";
import { useT } from "@/i18n";

/** Top bar of the public pages (menu, reservations): logo home link, title, language and theme. */
export function PublicHeader({ title }: { title: string }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 glass border-b border-gold-line/50">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
        <CurtainLink href="/" aria-label={`${brand.name} — ${t("common.home")}`} className="pressable rounded-full">
          <Logo size={38} />
        </CurtainLink>
        <h1 className="min-w-0 flex-1 truncate font-display text-[1.35rem] font-semibold leading-tight">{title}</h1>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
