import 'server-only';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  documentOf,
  toRunSummary,
  validateCompatDocument,
  type CompatDocument,
  type CompatRunSummary,
  type CompatSnapshot,
  type CompatSource,
} from './document';

/**
 * The runs Ready Up's CI reported, kept in one small JSON file.
 *
 * The site has no database, and this is a few hundred kilobytes at most: the
 * newest `COMPAT_HISTORY_LIMIT` runs, newest first, each with its checks.
 * The file is read once and then served from memory; every change is written
 * to a temporary file in the same directory and renamed over the old one, so
 * a crash mid-write leaves the previous file, never half of one.
 *
 * A run is upserted by its `run.id`, so one CI run moving from `queued` to
 * `checking` to `pass` is one entry. A copy that says nothing new is not
 * written, and a copy older (`checked_at`) than the stored one is ignored, so
 * an out-of-order push, or the published file lagging the pushes, cannot roll
 * a run back. Ported from the platform's compatService.ts, with the database
 * swapped for the file.
 */

/** Runs kept; older ones are dropped. */
export const COMPAT_HISTORY_LIMIT = 200;

const FILE_NAME = 'compat.json';
const FILE_VERSION = 1;

interface StoreFile {
  version: typeof FILE_VERSION;
  runs: CompatSnapshot[];
}

export type CompatIngestResult =
  | { status: 'stored'; created: boolean; runId: string }
  | { status: 'unchanged'; runId: string }
  | { status: 'stale'; runId: string };

export interface CompatIngestOutcome {
  result: CompatIngestResult;
  /** Set when something was stored and the run is still in the history. */
  change: { latest: CompatSnapshot | null; run: CompatRunSummary } | null;
}

/** Newest first: by when the run started, then by when this site first stored it. */
function newestFirst(a: CompatSnapshot, b: CompatSnapshot): number {
  if (a.run.started_at !== b.run.started_at) return a.run.started_at < b.run.started_at ? 1 : -1;
  if (a.received_at !== b.received_at) return a.received_at < b.received_at ? 1 : -1;
  return 0;
}

const SOURCES: readonly CompatSource[] = ['push', 'pull'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** A stored run read back from disk, checked like a fresh document; null when it is not one. */
function readStoredRun(value: unknown): CompatSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const { source, received_at, updated_at, ...rest } = value as Record<string, unknown>;
  if (!SOURCES.includes(source as CompatSource)) return null;
  if (typeof received_at !== 'string' || !ISO.test(received_at)) return null;
  if (typeof updated_at !== 'string' || !ISO.test(updated_at)) return null;
  const checked = validateCompatDocument(rest);
  if (!checked.ok) return null;
  return { ...checked.value, source: source as CompatSource, received_at, updated_at };
}

export interface CompatStore {
  readonly file: string;
  /** Newest run with every check, or null before the first one. */
  latest(): Promise<CompatSnapshot | null>;
  /** Newest `limit` runs (1..COMPAT_HISTORY_LIMIT), newest first, without the checks. */
  runs(limit: number): Promise<CompatRunSummary[]>;
  /** Whether any stored run came from a push. */
  hasPush(): Promise<boolean>;
  ingest(doc: CompatDocument, source: CompatSource, now?: number): Promise<CompatIngestOutcome>;
}

export function createCompatStore(dir: string, { historyLimit = COMPAT_HISTORY_LIMIT } = {}): CompatStore {
  const file = path.join(dir, FILE_NAME);
  let runs: CompatSnapshot[] | null = null;
  let loading: Promise<CompatSnapshot[]> | null = null;
  // Ingests run one at a time, so two copies of one run cannot interleave.
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<CompatSnapshot[]> {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const list = (parsed as Partial<StoreFile> | null)?.runs;
    if ((parsed as Partial<StoreFile> | null)?.version !== FILE_VERSION || !Array.isArray(list)) {
      // Keep the unreadable file for a look, and start over.
      const aside = `${file}.unreadable-${Date.now()}`;
      await rename(file, aside).catch(() => {});
      console.warn(`[compat] ${file} is not a compat store; moved it to ${aside} and started empty`);
      return [];
    }
    const valid = list.map(readStoredRun).filter((r): r is CompatSnapshot => r !== null);
    if (valid.length !== list.length) {
      console.warn(`[compat] skipped ${list.length - valid.length} unreadable run(s) in ${file}`);
    }
    return valid.sort(newestFirst).slice(0, historyLimit);
  }

  async function current(): Promise<CompatSnapshot[]> {
    if (runs) return runs;
    loading ??= load().finally(() => {
      loading = null;
    });
    runs = await loading;
    return runs;
  }

  /** Write the whole file: temp file in the same directory, flushed, then renamed over the old one. */
  async function persist(next: CompatSnapshot[]): Promise<void> {
    await mkdir(dir, { recursive: true });
    const body = `${JSON.stringify({ version: FILE_VERSION, runs: next } satisfies StoreFile)}\n`;
    const tmp = path.join(dir, `.${FILE_NAME}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      const handle = await open(tmp, 'w', 0o644);
      try {
        await handle.writeFile(body, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tmp, file);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }

  async function ingestNow(doc: CompatDocument, source: CompatSource, now: number): Promise<CompatIngestOutcome> {
    const list = await current();
    const existing = list.find((r) => r.run.id === doc.run.id);
    if (existing) {
      // A copy checked earlier than the one stored is late, not news.
      if (doc.checked_at < existing.checked_at) {
        return { result: { status: 'stale', runId: doc.run.id }, change: null };
      }
      if (JSON.stringify(documentOf(existing)) === JSON.stringify(documentOf(doc))) {
        return { result: { status: 'unchanged', runId: doc.run.id }, change: null };
      }
    }

    const at = new Date(now).toISOString();
    const stored: CompatSnapshot = {
      ...documentOf(doc),
      source,
      received_at: existing?.received_at ?? at,
      updated_at: at,
    };
    const next = [...list.filter((r) => r.run.id !== doc.run.id), stored].sort(newestFirst).slice(0, historyLimit);
    // Disk first: when the write fails, memory still matches the file.
    await persist(next);
    runs = next;

    const result: CompatIngestResult = { status: 'stored', created: !existing, runId: doc.run.id };
    // The run is gone already when it was older than the whole history.
    const kept = next.includes(stored);
    return { result, change: kept ? { latest: next[0] ?? null, run: toRunSummary(stored) } : null };
  }

  return {
    file,
    async latest() {
      return (await current())[0] ?? null;
    },
    async runs(limit) {
      const bounded = Math.min(Math.max(1, Math.floor(limit)), historyLimit);
      return (await current()).slice(0, bounded).map(toRunSummary);
    },
    async hasPush() {
      return (await current()).some((r) => r.source === 'push');
    },
    ingest(doc, source, now = Date.now()) {
      const task = queue.then(() => ingestNow(doc, source, now));
      queue = task.catch(() => {});
      return task;
    },
  };
}
