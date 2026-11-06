"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Loading state for a request that can be repeated. If a newer request starts
 * before an older one finishes, the older result is ignored.
 */
export function useLatestRequest<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  const run = useCallback(async (request: () => Promise<T>) => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const res = await request();
      if (id !== latest.current) return;
      setData(res);
      setFailed(false);
    } catch {
      if (id === latest.current) setFailed(true);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  return { data, loading, failed, run };
}
