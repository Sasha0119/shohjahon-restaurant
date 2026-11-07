import type { ServerToClientEvents } from "@app/shared/api";

/**
 * What business logic sees of the realtime layer: "emit this event to these
 * rooms". The Socket.io implementation lives in socket.ts; tests use the
 * recording implementation below.
 */
export interface Realtime {
  emit<E extends keyof ServerToClientEvents>(
    rooms: string | string[],
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  /** Immediately drop the live sockets of staff logins that were just revoked. */
  disconnectStaffSessions(sessionIds: string[]): void;
  /** Immediately drop the guests' sockets of a visit that just closed. */
  disconnectTableSession(sessionId: string): void;
}

export interface RecordedEvent {
  rooms: string[];
  event: string;
  payload: unknown;
}

export function createRecordingRealtime(): Realtime & {
  events: RecordedEvent[];
  disconnectedSessions: string[];
  disconnectedTableSessions: string[];
  clear(): void;
} {
  const events: RecordedEvent[] = [];
  const disconnectedSessions: string[] = [];
  const disconnectedTableSessions: string[] = [];
  return {
    events,
    disconnectedSessions,
    disconnectedTableSessions,
    disconnectStaffSessions: (ids) => void disconnectedSessions.push(...ids),
    disconnectTableSession: (id) => void disconnectedTableSessions.push(id),
    clear: () => void events.splice(0),
    emit(rooms, event, ...args) {
      events.push({ rooms: Array.isArray(rooms) ? rooms : [rooms], event, payload: args[0] });
    },
  };
}
