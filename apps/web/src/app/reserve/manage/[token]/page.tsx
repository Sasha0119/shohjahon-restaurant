import type { Metadata } from "next";
import { ManageBooking } from "./manage-booking";

// The address contains the guest's private link.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** /reserve/manage/<token>: see or cancel one booking. */
export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ManageBooking token={token} />;
}
