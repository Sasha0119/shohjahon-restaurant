"use client";

import { brand, localize, type LocalizedText } from "@app/config";
import { ExternalLink, Heart, Loader2, Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/i18n";
import { translateError } from "@/i18n/errors";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useTableStore } from "@/store/table-store";

type Phase =
  { kind: "rate" } | { kind: "thanks"; publicLinks: { label: LocalizedText; url: string }[]; isPublic: boolean };

/**
 * "How was your visit?" — shown only after paying.
 * 4–5 stars → thank-you + the restaurant's public review links.
 * 1–3 stars → a private note for the manager (never published).
 */
export function RatingPanel({ sessionId, className }: { sessionId: string; className?: string }) {
  const { t, locale } = useI18n();
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
      const res = await api<{ kind: "public" | "private"; reviewLinks: { label: LocalizedText; url: string }[] }>(
        "POST",
        "/api/session/review",
        {
          rating,
          comment: comment.trim(),
        },
      );
      setPhase({ kind: "thanks", publicLinks: res.reviewLinks, isPublic: res.kind === "public" });
      markReviewed(sessionId);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "ALREADY_REVIEWED") {
        markReviewed(sessionId);
        toast.info(t("rate.alreadyRated"));
      } else toast.error(translateError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const shown = hover || rating;
  return (
    <section
      className={cn("card w-full p-5 text-center ring-1 ring-gold-line", className)}
      aria-labelledby="rate-title"
    >
      <>
        {phase.kind === "rate" ? (
          <div className="enter" key="rate">
            <h2 id="rate-title" className="font-display text-2xl font-semibold">
              {t("rate.title")}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{t("rate.subtitle")}</p>
            <div
              role="radiogroup"
              aria-labelledby="rate-title"
              className="mt-4 flex justify-center gap-1"
              onMouseLeave={() => setHover(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${t("rate.stars", { count: n })} — ${t(`rate.labels.${String(n) as "1"}`)}`}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                  className="pressable grid size-12 place-items-center rounded-full"
                >
                  <span className={cn("block transition-transform", n <= shown && "scale-110")}>
                    <Star
                      className={cn(
                        "size-9 transition-colors",
                        n <= shown ? "fill-primary text-primary" : "text-fg/25",
                      )}
                      strokeWidth={1.6}
                      aria-hidden
                    />
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-1 h-5 text-sm font-semibold text-fg-muted" aria-live="polite">
              {shown ? t(`rate.labels.${String(shown) as "1"}`) : ""}
            </p>
            <>
              {rating > 0 && (
                <div className="enter -mx-2 overflow-hidden px-2 pb-2 text-left">
                  <label htmlFor="rate-comment" className="mt-3 block text-sm font-semibold">
                    {rating <= 3 ? t("rate.privatePrompt") : t("rate.publicPrompt")}
                  </label>
                  <textarea
                    id="rate-comment"
                    rows={3}
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="mt-2 w-full resize-none rounded-2xl bg-muted px-4 py-3 text-[15px] ring-1 ring-inset ring-line focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <Button className="mt-3 w-full" size="lg" onClick={() => void submit()} disabled={busy}>
                    {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
                    {t("rate.send")}
                  </Button>
                </div>
              )}
            </>
          </div>
        ) : (
          <div key="thanks" className="enter flex flex-col items-center">
            <span className="enter grid size-14 place-items-center rounded-full bg-primary/12 text-primary ring-1 ring-gold-line">
              <Heart className="size-7 fill-current" aria-hidden />
            </span>
            <p className="mt-3 font-display text-lg font-semibold" role="status">
              {phase.isPublic
                ? phase.publicLinks.length
                  ? t("rate.thanksPublic")
                  : t("rate.thanksPublicNoLinks")
                : t("rate.thanksPrivate")}
            </p>
            {phase.publicLinks.length > 0 && (
              <div className="mt-4 flex w-full flex-col gap-2">
                {phase.publicLinks.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-card bg-primary px-5 font-semibold text-on-primary shadow-glow"
                  >
                    {localize(l.label, locale, brand.defaultLanguage)}
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    </section>
  );
}
