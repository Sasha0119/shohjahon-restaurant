"use client";

import { Bell, BellOff, LogOut, Volume2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { IconButton } from "@/components/ui/button";
import { useT } from "@/i18n";
import { audioUnlocked, chime, loadMuted, saveMuted, unlockAudio } from "@/lib/chime";
import { cn } from "@/lib/cn";
import { useStaffSession } from "./staff-session";

/** Sound alerts with mute (remembered on this device) and the browser's tap-to-unlock rule. */
export function useSoundAlerts() {
  const [muted, setMuted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    setMuted(loadMuted());
    setUnlocked(audioUnlocked());
    const unlock = () => void unlockAudio().then(setUnlocked);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggle = useCallback(() => {
    setMuted((m) => {
      saveMuted(!m);
      return !m;
    });
  }, []);

  const play = useCallback((urgent = false) => !muted && chime(urgent), [muted]);
  return { muted, unlocked, toggle, play };
}

export function StaffHeader({
  title,
  connected,
  sound,
  children,
}: {
  title: string;
  connected: boolean;
  sound: ReturnType<typeof useSoundAlerts>;
  children?: ReactNode;
}) {
  const t = useT();
  const { me, signOut } = useStaffSession();
  return (
    <header className="sticky top-0 z-30 border-b border-line glass">
      <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2">
        <Logo size={36} />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          <p className="truncate text-xs font-medium text-fg-muted">{me.name}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-card px-2.5 py-1 text-xs font-semibold",
            connected ? "bg-success/12 text-success" : "bg-warning/15 text-warning",
          )}
          role="status"
        >
          <span className={cn("size-1.5 rounded-full", connected ? "animate-pulse bg-success" : "bg-warning")} />
          {connected ? t("kitchen.online") : t("kitchen.offline")}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {children}
          <IconButton
            label={sound.muted ? t("kitchen.soundOff") : t("kitchen.soundOn")}
            variant="muted"
            onClick={sound.toggle}
            aria-pressed={!sound.muted}
          >
            {sound.muted ? <BellOff className="size-5" aria-hidden /> : <Bell className="size-5" aria-hidden />}
          </IconButton>
          <LanguageSwitcher />
          <ThemeToggle />
          <IconButton label={t("staff.signOut")} onClick={signOut}>
            <LogOut className="size-5" aria-hidden />
          </IconButton>
        </div>
      </div>
      {!sound.muted && !sound.unlocked && (
        <p className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 bg-primary px-4 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.375rem)] text-sm font-semibold text-on-primary">
          <Volume2 className="size-4" aria-hidden />
          {t("kitchen.enableSound")}
        </p>
      )}
    </header>
  );
}
