"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Heart, Loader2, Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useTableStore } from "@/store/table-store";

type Phase = { kind: "rate" } | { kind: "thanks"; publicLinks: { label: string; url: string }[]; isPublic: boolean };

/**
 * "How was your visit?" — shown only after paying.
 * 4–5 stars → thank-you + the restaurant's public review links.
 * 1–3 stars → a private note for the manager (never published).
 */
export function RatingPanel({ sessionId, className }: { sessionId: string; className?: string }) {
  const t = useT();
  const reviewed = useTableStore((s) => s.reviewedSessions.includes(sessionId));
  const markReviewed = useTableStore((s) => s.markReviewed);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "rate" });

  if (reviewed && phase.kind === "rate") return null;

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api<{ kind: "public" | "private"; reviewLinks: { label: string; url: string }[] }>("POST", "/api/session/review", {
        rating,
        comment: comment.trim(),
      });
      setPhase({ kind: "thanks", publicLinks: res.reviewLinks, isPublic: res.kind === "public" });
      markReviewed(sessionId);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "ALREADY_REVIEWED") {
        markReviewed(sessionId);
        toast.info(t("rate.alreadyRated"));
      } else toast.error(e instanceof ApiClientError ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const shown = hover || rating;
  return (
    <section className={cn("w-full rounded-card bg-surface p-5 text-center shadow-soft ring-1 ring-line/60", className)} aria-labelledby="rate-title">
      <AnimatePresence mode="wait" initial={false}>
        {phase.kind === "rate" ? (
          <motion.div key="rate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2 id="rate-title" className="text-xl font-semibold">
              {t("rate.title")}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{t("rate.subtitle")}</p>
            <div role="radiogroup" aria-labelledby="rate-title" className="mt-4 flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <motion.button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${t("rate.stars", { count: n })} — ${t(`rate.labels.${String(n) as "1"}`)}`}
                  whileTap={{ scale: 0.85 }}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                  className="grid size-12 place-items-center rounded-full"
                >
                  <motion.span animate={{ scale: n <= shown ? 1.12 : 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                    <Star
                      className={cn("size-9 transition-colors", n <= shown ? "fill-secondary text-secondary" : "text-fg/25")}
                      strokeWidth={1.6}
                      aria-hidden
                    />
                  </motion.span>
                </motion.button>
              ))}
            </div>
            <p className="mt-1 h-5 text-sm font-semibold text-fg-muted" aria-live="polite">
              {shown ? t(`rate.labels.${String(shown) as "1"}`) : ""}
            </p>
            <AnimatePresence initial={false}>
              {rating > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="-mx-2 overflow-hidden px-2 pb-2 text-left">
                  <label htmlFor="rate-comment" className="mt-3 block text-sm font-semibold">
                    {rating <= 3 ? t("rate.privatePrompt") : t("rate.publicPrompt")}
                  </label>
                  <textarea
                    id="rate-comment"
                    rows={3}
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="mt-2 w-full resize-none rounded-2xl bg-muted px-4 py-3 text-[15px] focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <Button className="mt-3 w-full" size="lg" onClick={() => void submit()} disabled={busy}>
                    {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
                    {t("rate.send")}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="thanks" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
            <motion.span
              initial={{ scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
              className="grid size-14 place-items-center rounded-full bg-primary/12 text-primary"
            >
              <Heart className="size-7 fill-current" aria-hidden />
            </motion.span>
            <p className="mt-3 font-semibold" role="status">
              {phase.isPublic ? (phase.publicLinks.length ? t("rate.thanksPublic") : t("rate.thanksPublicNoLinks")) : t("rate.thanksPrivate")}
            </p>
            {phase.publicLinks.length > 0 && (
              <div className="mt-4 flex w-full flex-col gap-2">
                {phase.publicLinks.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-on-primary shadow-glow"
                  >
                    {l.label}
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
