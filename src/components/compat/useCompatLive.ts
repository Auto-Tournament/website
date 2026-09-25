'use client';

import { useEffect, useState } from 'react';
import type { CompatRunSummary, CompatSnapshot, CompatUpdateEvent, CompatView } from '@/lib/compat/document';

/** Runs shown in the history list (the same number the server renders). */
export const HISTORY_SHOWN = 20;
const POLL_MS = 60_000;

/** `live`: the stream is open. `polling`: it failed, so the page asks every minute. */
export type CompatLiveMode = 'connecting' | 'live' | 'polling';

/** Newest first, as the server sorts: by when the run started. */
export function upsertRun(runs: CompatRunSummary[], run: CompatRunSummary, max = HISTORY_SHOWN): CompatRunSummary[] {
  const next = runs.filter((r) => r.run.id !== run.run.id);
  next.push(run);
  next.sort((a, b) => (a.run.started_at < b.run.started_at ? 1 : a.run.started_at > b.run.started_at ? -1 : 0));
  return next.slice(0, max);
}

async function fetchView(): Promise<CompatView | null> {
  try {
    const [latestRes, runsRes] = await Promise.all([
      fetch('/api/compat/latest', { cache: 'no-store' }),
      fetch(`/api/compat/runs?limit=${HISTORY_SHOWN}`, { cache: 'no-store' }),
    ]);
    if (!latestRes.ok || !runsRes.ok) return null;
    const latest = ((await latestRes.json()) as { latest: CompatSnapshot | null }).latest;
    const runs = ((await runsRes.json()) as { runs: CompatRunSummary[] }).runs;
    return { latest, runs };
  } catch {
    return null;
  }
}

function parse<T>(data: unknown): T | null {
  try {
    return typeof data === 'string' ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
}

/**
 * The page's data: what the server rendered, then kept current by
 * `GET /api/compat/stream` (a `snapshot` on every connect, an `update` on
 * every change). While the stream is down (or the browser has no
 * EventSource), it polls the latest run every minute; EventSource keeps
 * trying to reconnect meanwhile and polling stops once it is back.
 */
export function useCompatLive(initial: CompatView): { view: CompatView; mode: CompatLiveMode } {
  const [view, setView] = useState<CompatView>(initial);
  const [mode, setMode] = useState<CompatLiveMode>('connecting');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastPoll = Date.now(); // The server just rendered fresh data.

    const poll = async () => {
      lastPoll = Date.now();
      const next = await fetchView();
      if (!cancelled && next) setView(next);
    };
    const startPolling = () => {
      setMode('polling');
      if (timer) return;
      if (Date.now() - lastPoll >= POLL_MS) void poll();
      timer = setInterval(() => void poll(), POLL_MS);
    };
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (typeof EventSource === 'undefined') {
      startPolling();
      return () => {
        cancelled = true;
        stopPolling();
      };
    }

    const source = new EventSource('/api/compat/stream');
    source.addEventListener('open', () => {
      stopPolling();
      setMode('live');
    });
    source.addEventListener('snapshot', (e) => {
      const snapshot = parse<CompatView>((e as MessageEvent).data);
      if (snapshot) setView({ latest: snapshot.latest, runs: snapshot.runs.slice(0, HISTORY_SHOWN) });
    });
    source.addEventListener('update', (e) => {
      const update = parse<CompatUpdateEvent>((e as MessageEvent).data);
      if (update) setView((current) => ({ latest: update.latest, runs: upsertRun(current.runs, update.run) }));
    });
    // Fires on every drop. EventSource retries by itself unless the server
    // refused it (then readyState is CLOSED and only polling is left).
    source.addEventListener('error', startPolling);

    return () => {
      cancelled = true;
      source.close();
      stopPolling();
    };
  }, []);

  return { view, mode };
}

/** The current time, updated every `intervalMs`, for "checked 3 minutes ago". Starts at the server's `now`. */
export function useNow(serverNow: number, intervalMs = 30_000): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
