"use client";

import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { useT } from "@/i18n";

export function OfflineBanner() {
  const t = useT();
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="alert"
          initial={{ y: -48 }}
          animate={{ y: 0 }}
          exit={{ y: -48 }}
          className="fixed inset-x-0 top-0 z-[55] flex items-center justify-center gap-2 bg-fg px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 text-sm font-medium text-bg"
        >
          <WifiOff className="size-4" aria-hidden />
          {t("offline.banner")}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
