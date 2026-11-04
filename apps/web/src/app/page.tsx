"use client";

import { brand } from "@app/config";
import { motion } from "framer-motion";
import { ScanLine } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/brand/language-switcher";
import { Logo } from "@/components/brand/logo";
import { useT } from "@/i18n";

/** Guests normally arrive via /table/<token> from the QR code; this is the bare domain. */
export default function Landing() {
  const t = useT();
  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden text-white">
      <Image src={brand.heroImage.src} alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-black/40 to-black/85" />
      <div className="flex items-center gap-2.5 px-5 pt-[max(env(safe-area-inset-top),1.25rem)]">
        <Logo size={40} onImage />
        <span className="font-semibold">{brand.name}</span>
        <LanguageSwitcher onImage className="ml-auto" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mt-auto px-6 pb-16 sm:px-10"
      >
        <span className="grid size-16 place-items-center rounded-3xl glass-dark">
          <ScanLine className="size-8" aria-hidden />
        </span>
        <h1 className="mt-6 max-w-lg text-[clamp(2.2rem,8vw,3.5rem)] font-semibold leading-[1.02]">{t("landing.title")}</h1>
        <p className="mt-4 max-w-md text-[17px] text-white/85">{t("landing.body")}</p>
        <Link href="/staff" className="mt-10 inline-block text-sm font-semibold text-white/75 underline-offset-4 hover:underline">
          {t("landing.staff")}
        </Link>
      </motion.div>
    </main>
  );
}
