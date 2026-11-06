"use client";

import { BrandLoader } from "@/components/brand/brand-loader";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useT } from "@/i18n";
import { ApiClientError, api, type StaffMe, type StaffRole } from "@/lib/api";

interface StaffSessionValue {
  me: StaffMe;
  signOut: () => Promise<void>;
}

const StaffSessionContext = createContext<StaffSessionValue | null>(null);

export function useStaffSession(): StaffSessionValue {
  const ctx = useContext(StaffSessionContext);
  if (!ctx) throw new Error("useStaffSession must be used inside <StaffGate>");
  return ctx;
}

/**
 * Client-side gate for staff screens. The API enforces roles on every request;
 * this only decides what to show and where to redirect.
 */
export function StaffGate({ roles, children }: { roles: StaffRole[]; children: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<StaffMe | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ staff: StaffMe }>("GET", "/api/auth/me")
      .then(({ staff }) => {
        if (!alive) return;
        if (!roles.includes(staff.role)) {
          router.replace("/staff");
          return;
        }
        setMe(staff);
      })
      .catch((e) => {
        if (!alive) return;
        const login = roles.includes("manager") && roles.length === 1 ? "/staff/manager" : "/staff";
        if (e instanceof ApiClientError && e.status === 401) {
          router.replace(`${login}?next=${encodeURIComponent(pathname ?? "/")}`);
        } else {
          router.replace(login);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roles compared by value
  }, [roles.join(","), router, pathname]);

  const signOut = useCallback(async () => {
    try {
      await api("POST", "/api/auth/logout");
    } finally {
      router.replace(me?.role === "manager" ? "/staff/manager" : "/staff");
    }
  }, [me, router]);

  if (!me) {
    return <BrandLoader label={t("staff.checking")} />;
  }
  return <StaffSessionContext.Provider value={{ me, signOut }}>{children}</StaffSessionContext.Provider>;
}

export { safeNext } from "@/lib/safe-next";
