"use client";

import { SOCKET_CLIENT_OPTIONS, type ClientToServerEvents, type ServerToClientEvents } from "@app/shared/api";
import { io, type Socket } from "socket.io-client";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Same-origin by default (Next.js forwards /socket.io/ to the API).
 * Set NEXT_PUBLIC_SOCKET_URL to connect to the API directly instead.
 */
export function createSocket(): AppSocket {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
  return io(url as string, { ...SOCKET_CLIENT_OPTIONS, transports: [...SOCKET_CLIENT_OPTIONS.transports] });
}
