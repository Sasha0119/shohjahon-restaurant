"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "info" | "error";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    // Keep at most 2 on screen.
    set({ toasts: [...get().toasts.slice(-1), { ...toast, id }] });
    setTimeout(() => get().dismiss(id), toast.kind === "error" ? 5000 : 2600);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (title: string, body?: string) => useToastStore.getState().push({ kind: "success", title, body }),
  info: (title: string, body?: string) => useToastStore.getState().push({ kind: "info", title, body }),
  error: (title: string, body?: string) => useToastStore.getState().push({ kind: "error", title, body }),
};

const icons = { success: CircleCheck, info: Info, error: CircleAlert };

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]"
      aria-live="polite"
      role="status"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <motion.button
              type="button"
              key={t.id}
              layout
              onClick={() => dismiss(t.id)}
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-surface px-4 py-3 text-left shadow-lift ring-1 ring-line/70"
            >
              <Icon
                aria-hidden
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  t.kind === "success" && "text-success",
                  t.kind === "info" && "text-primary",
                  t.kind === "error" && "text-danger",
                )}
              />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{t.title}</span>
                {t.body && <span className="block text-sm text-fg-muted">{t.body}</span>}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
