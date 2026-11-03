"use client";

import { QrCode } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { useT } from "@/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <main className="grid min-h-svh place-items-center">
      <EmptyState icon={QrCode} title={t("notFound.title")} body={t("notFound.body")} />
    </main>
  );
}
