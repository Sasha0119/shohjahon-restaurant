"use client";

import type { ServerToClientEvents } from "@app/shared/api";
import { useEffect, useRef, useState } from "react";
import { createSocket, type AppSocket } from "@/lib/socket";

type Handlers = Partial<{ [E in keyof ServerToClientEvents]: ServerToClientEvents[E] }>;

interface Options {
  /**
   * Called after every connect, including the first: refetch to catch up on anything
   * missed (the page's first load can race the socket handshake, and events sent
   * in that gap would otherwise be lost).
   */
  onReconnect?: () => void;
  /** Called on every connect with the socket (e.g. to subscribe to kitchen stations). */
  onConnect?: (socket: AppSocket) => void;
}

/**
 * Live connection for staff screens (cookie-authenticated; the server puts the
 * socket in the right rooms for the role).
 */
export function useStaffSocket(
  handlers: Handlers,
  opts: Options | (() => void) = {},
): { connected: boolean; socket: AppSocket | null } {
  const options: Options = typeof opts === "function" ? { onReconnect: opts } : opts;
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const ref = useRef({ handlers, options });
  useEffect(() => {
    ref.current = { handlers, options };
  });

  useEffect(() => {
    const s = createSocket();
    setSocket(s);
    s.on("connect", () => {
      setConnected(true);
      ref.current.options.onConnect?.(s);
      ref.current.options.onReconnect?.();
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", () => setConnected(false));
    s.onAny((event: string, ...args: unknown[]) => {
      const h = ref.current.handlers[event as keyof ServerToClientEvents] as ((...a: unknown[]) => void) | undefined;
      h?.(...args);
    });
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, []);

  return { connected, socket };
}
