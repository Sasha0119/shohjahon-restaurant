"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMinWidth } from "@/hooks/use-media-query";
import { useMounted } from "@/hooks/use-mounted";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; also rendered as the heading unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  description?: string;
  /** Rendered full-bleed above the content (e.g. a photo). */
  media?: ReactNode;
  /** Sticky footer (e.g. "Add to cart"). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** When this changes, the content scrolls back to the top. */
  scrollKey?: string;
  /** "split": on desktop (lg+), `media` fills the left half and the content scrolls on the right. */
  layout?: "stack" | "split";
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Dialog that adapts to the screen:
 *  • phones (< md): bottom sheet — drag the handle down to dismiss;
 *  • tablets and desktops (md+): centered modal (no drag; click outside or Esc);
 *  • `layout="split"` on lg+: photo on the left, content on the right.
 * Esc closes, focus is trapped inside and restored on close, page scroll is locked.
 */
export function Sheet({
  open,
  onClose,
  title,
  hideTitle,
  description,
  media,
  footer,
  children,
  className,
  scrollKey,
  layout = "stack",
}: SheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);
  const t = useT();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const onCloseRef = useRef(onClose);
  const mounted = useMounted();
  const modal = useMinWidth("md");
  const wide = useMinWidth("lg");
  const split = wide && layout === "split" && !!media;
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => panelRef.current?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      html.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!mounted) return null;

  const heading = (
    <>
      <h2 id={titleId} className={cn(hideTitle ? "sr-only" : "pr-12 text-2xl font-semibold leading-tight")}>
        {title}
      </h2>
      {description && (
        <p id={descId} className="mt-1.5 text-[15px] text-fg-muted">
          {description}
        </p>
      )}
    </>
  );
  const footerBar = footer && (
    <div className="border-t border-gold-line/60 bg-surface/92 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.875rem)] md:pb-4">
      {footer}
    </div>
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cn(
              "glass-panel relative flex max-h-[min(92svh,900px)] w-full max-w-xl flex-col overflow-hidden rounded-t-sheet outline-none sm:mb-4 sm:rounded-sheet",
              "md:mb-0 md:max-h-[min(88svh,860px)] md:max-w-2xl",
              split && "lg:h-[min(86svh,760px)] lg:max-w-5xl lg:flex-row",
              className,
            )}
            initial={modal ? { opacity: 0, scale: 0.96, y: 12 } : { y: "100%" }}
            animate={modal ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={modal ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
            transition={modal ? { type: "spring", damping: 32, stiffness: 420, mass: 0.8 } : { type: "spring", damping: 34, stiffness: 340, mass: 0.9 }}
            drag={modal ? false : "y"}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            {/* Drag handle zone (phones only) */}
            {!modal && (
              <div
                className="absolute inset-x-0 top-0 z-20 flex h-7 cursor-grab touch-none items-start justify-center pt-2.5 active:cursor-grabbing"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <span className={cn("h-1.5 w-11 rounded-full", media ? "bg-white/80 shadow" : "bg-primary/40")} />
              </div>
            )}

            <IconButton
              label={t("common.close")}
              variant={media && !split ? "glass" : "muted"}
              onClick={onClose}
              className="absolute right-3 top-3 z-20 size-10"
            >
              <X className="size-5" aria-hidden />
            </IconButton>

            {split ? (
              <>
                <div className="relative w-1/2 shrink-0 overflow-hidden">{media}</div>
                <div className="flex min-h-0 w-1/2 flex-col">
                  <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="px-7 pb-7 pt-8">
                      {heading}
                      {children}
                    </div>
                  </div>
                  {footerBar}
                </div>
              </>
            ) : (
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
                  {media && (
                    <div className={cn(!modal && "touch-none")} onPointerDown={(e) => !modal && dragControls.start(e)}>
                      {media}
                    </div>
                  )}
                  <div className={cn("px-5 pb-6 md:px-7", media ? "pt-5" : "pt-8")}>
                    {heading}
                    {children}
                  </div>
                </div>
                {footerBar}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
