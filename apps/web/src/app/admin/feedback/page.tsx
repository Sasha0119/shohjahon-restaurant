"use client";

import type { FeedbackDTO } from "@app/shared/api";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CloudOff, Loader2, MessageSquareHeart, RotateCcw, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { useNow } from "@/hooks/use-now";
import { useStaffSocket } from "@/hooks/use-staff-socket";
import { useT } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";

type Filter = "new" | "handled" | "all";
interface Page {
  feedback: FeedbackDTO[];
  page: number;
  pageSize: number;
  total: number;
  counts: { new: number; handled: number };
}

export default function FeedbackPage() {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("new");
  const [data, setData] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (page = 1) => {
      try {
        const q = new URLSearchParams({ page: String(page), ...(filter !== "all" ? { status: filter } : {}) });
        const res = await api<Page>("GET", `/api/admin/feedback?${q}`);
        setData((prev) => (page > 1 && prev ? { ...res, feedback: [...prev.feedback, ...res.feedback] } : res));
        setFailed(false);
      } catch {
        setFailed(true);
      }
    },
    [filter],
  );
  useEffect(() => {
    setData(null);
    void load(1);
  }, [load]);

  useStaffSocket(
    {
      "feedback:created": ({ feedback }) => {
        toast.info(t("admin.feedback.newArrived", { number: feedback.tableNumber }));
        setFresh((s) => new Set(s).add(feedback.id));
        setData((d) =>
          d
            ? {
                ...d,
                counts: { ...d.counts, new: d.counts.new + 1 },
                feedback: filter === "handled" ? d.feedback : [feedback, ...d.feedback],
                total: filter === "handled" ? d.total : d.total + 1,
              }
            : d,
        );
      },
    },
    () => void load(1),
  );

  const setStatus = async (f: FeedbackDTO, status: "new" | "handled") => {
    setBusy(f.id);
    try {
      const { feedback } = await api<{ feedback: FeedbackDTO }>("PATCH", `/api/admin/feedback/${f.id}`, { status });
      setData((d) => {
        if (!d) return d;
        const leaves = filter !== "all" && filter !== status;
        const delta = status === "handled" ? -1 : 1;
        return {
          ...d,
          counts: { new: d.counts.new + delta, handled: d.counts.handled - delta },
          feedback: leaves ? d.feedback.filter((x) => x.id !== f.id) : d.feedback.map((x) => (x.id === f.id ? feedback : x)),
          total: leaves ? d.total - 1 : d.total,
        };
      });
      window.dispatchEvent(new CustomEvent("feedback-count-changed"));
    } catch (e) {
      toast.error(translateError(e, t));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-[2.1rem] font-semibold leading-tight">{t("admin.feedback.title")}</h1>
        <p className="mt-1 max-w-2xl text-fg-muted">{t("admin.feedback.subtitle")}</p>
      </div>

      <Segmented
        className="mt-6 max-w-md"
        label={t("admin.feedback.title")}
        value={filter}
        onChange={setFilter}
        options={[
          { value: "new", label: `${t("admin.feedback.tabs.new")}${data ? ` · ${data.counts.new}` : ""}` },
          { value: "handled", label: t("admin.feedback.tabs.handled") },
          { value: "all", label: t("admin.feedback.tabs.all") },
        ]}
      />

      <div className="mt-6">
        {failed && !data ? (
          <EmptyState icon={CloudOff} title={t("errors.generic")} action={<Button onClick={() => void load(1)}>{t("common.retry")}</Button>} />
        ) : !data ? (
          <div className="space-y-3">
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
          </div>
        ) : data.feedback.length === 0 ? (
          <EmptyState icon={MessageSquareHeart} title={t("admin.feedback.empty")} />
        ) : (
          <>
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {data.feedback.map((f) => (
                  <FeedbackCard key={f.id} f={f} fresh={fresh.has(f.id)} busy={busy === f.id} onSet={(s) => void setStatus(f, s)} />
                ))}
              </AnimatePresence>
            </ul>
            {data.feedback.length < data.total && (
              <Button variant="secondary" className="mt-4 w-full" onClick={() => void load(data.page + 1)}>
                {t("admin.feedback.loadMore")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FeedbackCard({ f, fresh, busy, onSet }: { f: FeedbackDTO; fresh: boolean; busy: boolean; onSet: (s: "new" | "handled") => void }) {
  const t = useT();
  const now = useNow(60_000) ?? Date.now();
  const handled = f.status === "handled";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 30 }}
      className={cn(
        "glass-card rounded-card p-5 outline-1 -outline-offset-1",
        handled ? "outline-transparent" : "outline-danger/30",
        fresh && "animate-pulse-ring",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-0.5" aria-label={t("rate.stars", { count: f.rating })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={cn("size-5", n <= f.rating ? "fill-secondary text-secondary" : "text-fg/20")} aria-hidden />
            ))}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {t("admin.feedback.table", { number: f.tableNumber })} · {f.guestName || t("admin.feedback.guest")} · {formatRelative(Date.parse(f.createdAt), now)}
          </p>
        </div>
        <Badge tone={handled ? "success" : "danger"}>{handled ? t("admin.feedback.tabs.handled") : t("admin.feedback.tabs.new")}</Badge>
      </div>
      <p className={cn("mt-3 whitespace-pre-wrap text-[15px] leading-relaxed", !f.comment && "italic text-fg-muted")}>
        {f.comment || t("admin.feedback.noComment")}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-xs text-fg-muted">
          {handled && f.handledBy && f.handledAt ? t("admin.feedback.handledBy", { name: f.handledBy, time: formatRelative(Date.parse(f.handledAt), now) }) : ""}
        </p>
        <Button size="sm" variant={handled ? "ghost" : "primary"} onClick={() => onSet(handled ? "new" : "handled")} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : handled ? <RotateCcw className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {handled ? t("admin.feedback.reopen") : t("admin.feedback.markHandled")}
        </Button>
      </div>
    </motion.li>
  );
}
