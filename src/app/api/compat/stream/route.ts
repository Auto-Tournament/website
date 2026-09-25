import { clientIp } from '@/lib/checkout';
import type { CompatUpdateEvent } from '@/lib/compat/document';
import { SSE_HEARTBEAT, sseEvent, subscribeCompat } from '@/lib/compat/events';
import { json } from '@/lib/compat/http';
import { getCompatView } from '@/lib/compat/service';

// Server-sent events for the /compatibility page. On connect: `snapshot`
// (the newest run and the recent history, so a reconnect catches up on
// anything missed); then `update` ({ latest, run }) on every stored change,
// and a comment every 25 s so the Cloudflare tunnel and other proxies keep
// the idle connection open. `no-transform` keeps `next start` from
// compressing (and so buffering) the stream.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;
/** Tells EventSource to wait 10 s before reconnecting after a drop. */
const RETRY_MS = 10_000;
const MAX_STREAMS = 500;
const MAX_STREAMS_PER_IP = 8;

const KEY = Symbol.for('autotournament.compat.streams');
function openStreams(): Map<string, number> {
  const holder = globalThis as { [KEY]?: Map<string, number> };
  holder[KEY] ??= new Map();
  return holder[KEY];
}

export async function GET(request: Request) {
  const streams = openStreams();
  const ip = clientIp(request.headers);
  const total = [...streams.values()].reduce((sum, n) => sum + n, 0);
  if (total >= MAX_STREAMS || (streams.get(ip) ?? 0) >= MAX_STREAMS_PER_IP) {
    // EventSource gives up on a non-200; the page then polls instead.
    return json(503, { success: false, error: 'Too many open streams, poll /api/compat/latest instead' }, { 'retry-after': '60' });
  }
  streams.set(ip, (streams.get(ip) ?? 0) + 1);

  const encoder = new TextEncoder();
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The reader is gone: the client disconnected.
          cleanup();
        }
      };

      // Subscribe before reading the snapshot, so a change in between is not lost
      // (at worst it arrives twice, which the page handles).
      const unsubscribe = subscribeCompat((event: CompatUpdateEvent) => send(sseEvent('update', event)));
      const heartbeat = setInterval(() => send(SSE_HEARTBEAT), HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener('abort', cleanup);
        const left = (streams.get(ip) ?? 1) - 1;
        if (left > 0) streams.set(ip, left);
        else streams.delete(ip);
        try {
          controller.close();
        } catch {
          // Already closed or errored.
        }
      };
      request.signal.addEventListener('abort', cleanup, { once: true });
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      send(`retry: ${RETRY_MS}\n\n`);
      getCompatView()
        .then((view) => send(sseEvent('snapshot', view)))
        .catch((err) => {
          console.error('[compat] could not read the snapshot for a stream', err instanceof Error ? err.message : 'unknown error');
        });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-store, no-transform',
      connection: 'keep-alive',
      // nginx and similar proxies: don't buffer.
      'x-accel-buffering': 'no',
    },
  });
}
