/**
 * Minimal JSON client for the API. Calls are same-origin (/api/*) and Next.js
 * forwards them to the API server, so cookies are first-party.
 */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function api<T = unknown>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "You appear to be offline.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiClientError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? res.statusText, err?.details);
  }
  return data as T;
}

export type StaffRole = "manager" | "waiter" | "kitchen";
export interface StaffMe {
  id: string;
  name: string;
  role: StaffRole;
}

/** Where each role lands after signing in. */
export const homeForRole: Record<StaffRole, string> = {
  manager: "/admin/overview",
  waiter: "/waiter",
  kitchen: "/kitchen",
};
