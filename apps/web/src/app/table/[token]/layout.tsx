import type { ReactNode } from "react";
import { GuestShell } from "@/components/guest/guest-shell";

/** /table/<signed-token> — the token comes from the table's QR code and is verified by the API. */
export default async function TableLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <GuestShell token={decodeURIComponent(token)}>{children}</GuestShell>;
}
