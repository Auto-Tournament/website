import type { CompatUpdateEvent } from './document';

/**
 * In-process pub/sub for compatibility updates: an ingest publishes, every
 * open `GET /api/compat/stream` listens. The site is one container, so one
 * process sees every ingest.
 *
 * The listeners live on globalThis: Next can bundle the ingest route and the
 * stream route into separate chunks, each with its own copy of this module,
 * and they must still share one set.
 */

export type CompatListener = (event: CompatUpdateEvent) => void;

const KEY = Symbol.for('autotournament.compat.listeners');
type Holder = { [KEY]?: Set<CompatListener> };

function listeners(): Set<CompatListener> {
  const holder = globalThis as Holder;
  holder[KEY] ??= new Set();
  return holder[KEY];
}

/** Calls `listener` on every update until the returned function is called. */
export function subscribeCompat(listener: CompatListener): () => void {
  const set = listeners();
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export function publishCompat(event: CompatUpdateEvent): void {
  for (const listener of [...listeners()]) {
    try {
      listener(event);
    } catch (err) {
      // One broken stream must not stop the others.
      console.warn('[compat] a stream listener failed', err instanceof Error ? err.name : 'unknown error');
    }
  }
}

export function compatListenerCount(): number {
  return listeners().size;
}

/** One server-sent event: `event: <name>` and the JSON on one `data:` line. */
export function sseEvent(name: string, data: unknown): string {
  // JSON.stringify never emits a raw newline, so one data line is enough.
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A comment line: keeps proxies from closing an idle stream; EventSource ignores it. */
export const SSE_HEARTBEAT = ': ping\n\n';
