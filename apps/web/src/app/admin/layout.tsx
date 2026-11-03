"use client";

import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { StaffGate } from "@/components/staff/staff-session";

const MANAGER_ONLY = ["manager" as const];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <StaffGate roles={MANAGER_ONLY}>
      <AdminShell>{children}</AdminShell>
    </StaffGate>
  );
}
