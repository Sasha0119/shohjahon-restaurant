"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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

/** How long the closing animation runs before the sheet leaves the page. Matches .sheet-panel. */
const CLOSE_MS = 340;
/** Drag this far down, or flick this fast (px per ms), to dismiss. */
const DISMISS_DISTANCE = 110;
const DISMISS_SPEED = 0.6;

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
  // Stays on the page while closing, and starts closed so opening can animate.
  const [rendered, setRendered] = useState(open);
  const [state, setState] = useState<"open" | "closed">("closed");
  useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setState("open")));
      return () => cancelAnimationFrame(frame);
    }
    setState("closed");
    const timer = setTimeout(() => setRendered(false), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Drag down to dismiss, on phones.
  const drag = useRef<{ startY: number; startTime: number; distance: number } | null>(null);
  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (modal) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startTime: e.timeStamp, distance: 0 };
    panelRef.current?.setAttribute("data-dragging", "");
  };
  const moveDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current || !panelRef.current) return;
    drag.current.distance = Math.max(0, e.clientY - drag.current.startY);
    panelRef.current.style.transform = `translateY(${drag.current.distance}px)`;
  };
  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current || !panelRef.current) return;
    const { distance, startTime } = drag.current;
    drag.current = null;
    panelRef.current.removeAttribute("data-dragging");
    panelRef.current.style.transform = "";
    const speed = distance / Math.max(1, e.timeStamp - startTime);
    if (distance > DISMISS_DISTANCE || speed > DISMISS_SPEED) onClose();
  };
  const dragHandlers = {
    onPointerDown: startDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
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

  if (!mounted || !rendered) return null;

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
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div aria-hidden data-state={state} className="sheet-backdrop absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        ref={panelRef}
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "sheet-panel glass-panel relative flex max-h-[min(92svh,900px)] w-full max-w-xl flex-col overflow-hidden rounded-t-sheet outline-none sm:mb-4 sm:rounded-sheet",
          "md:mb-0 md:max-h-[min(88svh,860px)] md:max-w-2xl",
          split && "lg:h-[min(86svh,760px)] lg:max-w-5xl lg:flex-row",
          className,
        )}
      >
        {/* Drag handle zone (phones only) */}
        {!modal && (
          <div
            className="absolute inset-x-0 top-0 z-20 flex h-7 cursor-grab touch-none items-start justify-center pt-2.5 active:cursor-grabbing"
            {...dragHandlers}
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
                <div className={cn(!modal && "touch-none")} {...dragHandlers}>
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
      </div>
    </div>,
    document.body,
  );
}
