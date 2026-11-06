"use client";

import type { GuestDTO } from "@app/shared/api";
import { Loader2, Pencil, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSessionStore } from "@/store/session-store";

/** Optional nickname (shown as "Added by …") and who else is at the table. */
export function NicknameCard() {
  const t = useT();
  const me = useSessionStore((s) => s.snapshot?.me);
  const guests = useSessionStore((s) => s.snapshot?.guests ?? []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (!me) return null;
  const showForm = editing || !me.nickname;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ version: number; guests: GuestDTO[] }>("PATCH", "/api/session/me", { nickname: draft });
      // The socket event may arrive first or not at all — apply the response either way.
      useSessionStore.getState().applyGuests(res.version, res.guests);
      setEditing(false);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <>
        {showForm ? (
          <form className="enter" key="form" onSubmit={save}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full text-primary ring-1 ring-gold-line">
                <Users className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-display text-lg font-semibold">{t("nickname.title")}</p>
                <p className="text-sm text-fg-muted">{t("nickname.body")}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <label className="sr-only" htmlFor="nickname">
                {t("nickname.label")}
              </label>
              <input
                id="nickname"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 24))}
                placeholder={t("nickname.placeholder")}
                autoComplete="nickname"
                maxLength={24}
                className="h-12 min-w-0 flex-1 rounded-card bg-muted px-4 ring-1 ring-inset ring-line placeholder:text-fg-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button type="submit" disabled={!draft.trim() || busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("common.save")}
              </Button>
            </div>
          </form>
        ) : (
          <div key="set" className="enter flex items-center gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-semibold text-on-primary"
              aria-hidden
            >
              {me.nickname.charAt(0).toUpperCase()}
            </span>
            <p className="min-w-0 flex-1 truncate font-semibold">{t("nickname.orderingAs", { name: me.nickname })}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(me.nickname);
                setEditing(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
              {t("common.change")}
            </Button>
          </div>
        )}
      </>

      {guests.length > 1 && (
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("join.atTable")}</span>
          <ul className="flex -space-x-2">
            {guests.map((g) => (
              <li
                key={g.id}
                title={g.id === me.id ? t("common.you") : g.nickname || t("common.guest")}
                className={cn(
                  "grid size-8 place-items-center rounded-full text-xs font-bold ring-2 ring-surface",
                  g.id === me.id ? "bg-primary text-on-primary" : "bg-muted text-fg",
                )}
              >
                {(g.id === me.id ? me.nickname || t("common.you") : g.nickname || "?").charAt(0).toUpperCase()}
              </li>
            ))}
          </ul>
          <span className="text-sm text-fg-muted">
            {guests
              .filter((g) => g.id !== me.id)
              .map((g) => g.nickname || t("common.guest"))
              .join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
