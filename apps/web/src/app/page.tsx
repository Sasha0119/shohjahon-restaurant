import type { Metadata } from "next";
import { headers } from "next/headers";
import { Landing } from "@/components/landing/landing";
import { INTRO_BOOT } from "@/components/landing/intro";

// The one page search engines may index; table and staff pages stay private (see app/layout.tsx).
export const metadata: Metadata = { robots: { index: true, follow: true } };

/** The bare domain. Guests with a QR code go straight to /table/<token>. */
export default async function HomePage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      {/* Decides before first paint whether the intro plays, so returning visitors never see it flash. */}
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: INTRO_BOOT }} />
      <Landing />
    </>
  );
}
