import 'server-only';
import { compatDataDir, compatFeedSetting, reportCompatConfig } from './config';
import type { CompatDocument, CompatSource, CompatView } from './document';
import { publishCompat } from './events';
import { fetchCompatFeed } from './feed';
import { createCompatStore, type CompatIngestResult, type CompatStore } from './store';

/**
 * Ready Up compatibility for the `/compatibility` page and the
 * `/api/compat/*` routes. Two ways in, both ending in `ingestCompat`:
 *
 * - push: Ready Up's CI posts every run update to `POST /api/compat/events`;
 * - pull: until the first push arrives (or always, with COMPAT_FEED_URL set),
 *   reads use the published compat.json, fetched at most every five minutes.
 *
 * Every stored change is published to the open streams (lib/compat/events.ts).
 */

/** Runs the page lists, and what the stream's snapshot carries. */
export const COMPAT_HISTORY_SHOWN = 20;

/** How often the published file is fetched (GitHub serves it with max-age=300 too). */
export const COMPAT_FEED_INTERVAL_MS = 5 * 60_000;

/** How long a read waits for the first fetch of the feed while nothing is stored. */
const FIRST_FETCH_WAIT_MS = 3_000;

type State = {
  store: { dir: string; store: CompatStore } | null;
  feed: { lastAttemptAt: number; etag: string | null; lastError: string | null; running: Promise<void> | null };
};

// On globalThis for the same reason as the listeners in events.ts: every
// route must see the one store, not a copy per bundle.
const KEY = Symbol.for('autotournament.compat.state');
function state(): State {
  const holder = globalThis as { [KEY]?: State };
  holder[KEY] ??= { store: null, feed: { lastAttemptAt: 0, etag: null, lastError: null, running: null } };
  return holder[KEY];
}

function store(): CompatStore {
  const s = state();
  const dir = compatDataDir();
  if (s.store?.dir !== dir) {
    reportCompatConfig();
    s.store = { dir, store: createCompatStore(dir) };
  }
  return s.store.store;
}

/** Store a validated document and tell the open streams when anything changed. */
export async function ingestCompat(doc: CompatDocument, source: CompatSource): Promise<CompatIngestResult> {
  const { result, change } = await store().ingest(doc, source);
  if (result.status === 'stored') {
    console.info(
      `[compat] ${result.created ? 'new' : 'updated'} run ${doc.run.id} (${source}): CS2 ${doc.cs2.patch || '-'} ` +
        `build ${doc.cs2.buildid}, ${doc.run.stage}/${doc.run.state}, overall ${doc.overall}`,
    );
  }
  if (change) publishCompat(change);
  return result;
}

/** One fetch of the feed, ingested as a pull. Never throws. */
async function pollFeed(url: string): Promise<void> {
  const feed = state().feed;
  const outcome = await fetchCompatFeed(url, { etag: feed.etag });
  if (outcome.status === 'error') {
    // A feed that stays down logs once, not every five minutes.
    if (outcome.error !== feed.lastError) {
      console.warn(`[compat] could not read ${url} (keeping the last good run): ${outcome.error}`);
    }
    feed.lastError = outcome.error;
    return;
  }
  if (feed.lastError) console.info(`[compat] ${url} answers again`);
  feed.lastError = null;
  if (outcome.status === 'not_modified') return;
  try {
    await ingestCompat(outcome.document, 'pull');
    feed.etag = outcome.etag;
  } catch (err) {
    console.warn('[compat] could not store the run from the feed', err instanceof Error ? err.message : 'unknown error');
  }
}

/** Starts a feed fetch when one is due; returns it (or the one running), else null. */
async function refreshFeedIfDue(now = Date.now()): Promise<Promise<void> | null> {
  const setting = compatFeedSetting();
  if (setting.mode === 'off') return null;
  const feed = state().feed;
  if (feed.running) return feed.running;
  if (now - feed.lastAttemptAt < COMPAT_FEED_INTERVAL_MS) return null;
  if (setting.mode === 'until_push' && (await store().hasPush())) return null;
  feed.lastAttemptAt = now;
  feed.running = pollFeed(setting.url).finally(() => {
    feed.running = null;
  });
  return feed.running;
}

/**
 * Freshen from the feed when it is due. Waits (briefly) only while nothing
 * is stored yet, so the first visitor after a deploy sees the published
 * result; otherwise the fetch runs in the background and the next read or
 * the stream gets the change.
 */
async function freshen(): Promise<void> {
  try {
    const running = await refreshFeedIfDue();
    if (!running) return;
    if ((await store().latest()) !== null) return;
    await Promise.race([running, new Promise((resolve) => setTimeout(resolve, FIRST_FETCH_WAIT_MS))]);
  } catch (err) {
    console.warn('[compat] could not check the feed', err instanceof Error ? err.message : 'unknown error');
  }
}

export async function getCompatLatest() {
  await freshen();
  return store().latest();
}

export async function getCompatRuns(limit: number) {
  await freshen();
  return store().runs(limit);
}

/** The newest run and the recent history, for the page and the stream. */
export async function getCompatView(limit = COMPAT_HISTORY_SHOWN): Promise<CompatView> {
  await freshen();
  const s = store();
  const [latest, runs] = await Promise.all([s.latest(), s.runs(limit)]);
  return { latest, runs };
}
