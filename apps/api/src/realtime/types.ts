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
}

export interface RecordedEvent {
  rooms: string[];
  event: string;
  payload: unknown;
}

export function createRecordingRealtime(): Realtime & { events: RecordedEvent[]; clear(): void } {
  const events: RecordedEvent[] = [];
  return {
    events,
    clear: () => void events.splice(0),
    emit(rooms, event, ...args) {
      events.push({ rooms: Array.isArray(rooms) ? rooms : [rooms], event, payload: args[0] });
    },
  };
}
