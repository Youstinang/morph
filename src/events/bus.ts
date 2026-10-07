import { parseDraft, type EventDraft, type EventOf, type EventSource, type EventType, type WorkspaceEvent } from "./schema";

export type EventListener = (event: WorkspaceEvent) => void;

export interface EventBusOptions {
  /** Supplies the run clock and cycle stamped on each event. */
  clock: () => { at: number; cycle: number };
  historyLimit?: number;
  onListenerError?: (error: unknown, event: WorkspaceEvent) => void;
}

export interface EventBus {
  /** Validates, stamps and delivers an event; returns null (and changes nothing) if the draft is malformed. */
  publish(draft: EventDraft, source: EventSource): WorkspaceEvent | null;
  subscribe(listener: EventListener): () => void;
  on<T extends EventType>(type: T, listener: (event: EventOf<T>) => void): () => void;
  history(): readonly WorkspaceEvent[];
  stats(): { published: number; rejected: number; listenerErrors: number };
}

/**
 * Synchronous in-memory bus. Events published while listeners run are queued and delivered after the
 * current event reaches every listener, so all listeners see one global order and runs stay deterministic.
 */
export function createEventBus({ clock, historyLimit = 1000, onListenerError }: EventBusOptions): EventBus {
  const listeners = new Set<EventListener>();
  const log: WorkspaceEvent[] = [];
  const queue: WorkspaceEvent[] = [];
  let seq = 0;
  let rejected = 0;
  let listenerErrors = 0;
  let draining = false;

  function drain() {
    draining = true;
    try {
      for (let event = queue.shift(); event; event = queue.shift()) {
        for (const listener of [...listeners]) {
          try {
            listener(event);
          } catch (error) {
            listenerErrors += 1;
            onListenerError?.(error, event);
          }
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    publish(input, source) {
      const draft = parseDraft(input);
      if (!draft) {
        rejected += 1;
        return null;
      }
      const { at, cycle } = clock();
      seq += 1;
      const event = { ...draft, seq, at, cycle, source } as WorkspaceEvent;
      log.push(event);
      if (log.length > historyLimit) log.splice(0, log.length - historyLimit);
      queue.push(event);
      if (!draining) drain();
      return event;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    on(type, listener) {
      const filtered: EventListener = (event) => {
        if (event.type === type) listener(event as EventOf<typeof type>);
      };
      listeners.add(filtered);
      return () => listeners.delete(filtered);
    },
    history: () => log,
    stats: () => ({ published: seq, rejected, listenerErrors }),
  };
}
