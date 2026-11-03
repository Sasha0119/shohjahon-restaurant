"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet dialog: drag the handle down to dismiss, Esc to close,
 * focus is trapped inside and restored on close, page scroll is locked.
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

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
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
              "relative flex max-h-[min(92svh,900px)] w-full max-w-xl flex-col overflow-hidden rounded-t-sheet bg-surface shadow-lift outline-none sm:mb-4 sm:rounded-sheet",
              className,
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 340, mass: 0.9 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            {/* Drag handle zone */}
            <div
              className="absolute inset-x-0 top-0 z-20 flex h-7 cursor-grab touch-none items-start justify-center pt-2.5 active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <span
                className={cn(
                  "h-1.5 w-11 rounded-full",
                  media ? "bg-white/80 shadow" : "bg-fg/20",
                )}
              />
            </div>

            <IconButton
              label={t("common.close")}
              variant={media ? "glass" : "muted"}
              onClick={onClose}
              className="absolute right-3 top-3 z-20 size-10"
            >
              <X className="size-5" aria-hidden />
            </IconButton>

            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
              {media && (
                <div className="touch-none" onPointerDown={(e) => dragControls.start(e)}>
                  {media}
                </div>
              )}
              <div className={cn("px-5 pb-6", media ? "pt-5" : "pt-8")}>
                <h2
                  id={titleId}
                  className={cn(hideTitle ? "sr-only" : "pr-12 text-2xl font-semibold leading-tight")}
                >
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1.5 text-[15px] text-fg-muted">
                    {description}
                  </p>
                )}
                {children}
              </div>
            </div>

            {footer && (
              <div className="border-t border-line/70 bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.875rem)]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
