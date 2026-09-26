import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateCompatDocument, type CompatDocument } from './document';
import { COMPAT_HISTORY_LIMIT, createCompatStore } from './store';
import { compatDoc, type TestCompatDoc } from './testDoc';

// Lets a test make the rename (the commit step of the atomic write) fail.
const fsState = vi.hoisted(() => ({ failRename: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (fsState.failRename) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return actual.rename(...args);
    },
  };
});

function valid(doc: TestCompatDoc): CompatDocument {
  const checked = validateCompatDocument(doc);
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  return checked.value;
}

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 25, 12, minutes)).toISOString();

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'compat-store-'));
  fsState.failRename = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('compat store', () => {
  it('starts empty without a file, and creates the directory on the first write', async () => {
    const store = createCompatStore(path.join(dir, 'nested', 'compat'));
    expect(await store.latest()).toBeNull();
    expect(await store.runs(20)).toEqual([]);
    const { result } = await store.ingest(valid(compatDoc()), 'push');
    expect(result).toMatchObject({ status: 'stored', created: true });
    expect(JSON.parse(await readFile(store.file, 'utf8')).runs).toHaveLength(1);
  });

  it('writes atomically: the whole file every time, no temporary files left over', async () => {
    const store = createCompatStore(dir);
    for (let i = 0; i < 5; i++) {
      await store.ingest(valid(compatDoc({ run: { id: `run-${i}`, started_at: at(i) }, checked_at: at(i) })), 'push');
    }
    expect(await readdir(dir)).toEqual(['compat.json']);
    const onDisk = JSON.parse(await readFile(store.file, 'utf8'));
    expect(onDisk.version).toBe(1);
    expect(onDisk.runs.map((r: { run: { id: string } }) => r.run.id)).toEqual(['run-4', 'run-3', 'run-2', 'run-1', 'run-0']);
  });

  it('keeps the old file, and memory in step with it, when a write fails', async () => {
    const store = createCompatStore(dir);
    await store.ingest(valid(compatDoc({ run: { id: 'kept' } })), 'push');
    const before = await readFile(store.file, 'utf8');

    fsState.failRename = true;
    await expect(store.ingest(valid(compatDoc({ run: { id: 'lost' } })), 'push')).rejects.toThrow('disk full');
    fsState.failRename = false;

    expect(await readFile(store.file, 'utf8')).toBe(before);
    expect(await readdir(dir)).toEqual(['compat.json']);
    expect((await store.runs(20)).map((r) => r.run.id)).toEqual(['kept']);
    // And the next ingest still works.
    expect((await store.ingest(valid(compatDoc({ run: { id: 'next' } })), 'push')).result.status).toBe('stored');
  });

  it('survives a restart: a new store reads the file back', async () => {
    const first = createCompatStore(dir);
    const doc = valid(compatDoc({ run: { id: 'persisted' } }));
    await first.ingest(doc, 'push');
    const second = createCompatStore(dir);
    const latest = await second.latest();
    expect(latest?.run.id).toBe('persisted');
    expect(latest?.components).toEqual(doc.components);
    expect(latest?.source).toBe('push');
    expect(await second.hasPush()).toBe(true);
  });

  it('upserts by run.id: queued, checking, then the verdict is one run', async () => {
    const store = createCompatStore(dir);
    const id = 'gh-123';
    const queued = compatDoc({ run: { id, state: 'queued', started_at: at(0), finished_at: null }, cs2: { patch: '' }, overall: 'checking', checked_at: at(0) });
    const checking = compatDoc({ run: { id, state: 'checking', started_at: at(0), finished_at: null }, overall: 'checking', checked_at: at(1) });
    const done = compatDoc({ run: { id, state: 'pass', started_at: at(0), finished_at: at(3) }, overall: 'pass', checked_at: at(3) });

    const a = await store.ingest(valid(queued), 'push', Date.parse(at(0)));
    const b = await store.ingest(valid(checking), 'push', Date.parse(at(1)));
    const c = await store.ingest(valid(done), 'push', Date.parse(at(3)));
    expect([a.result, b.result, c.result]).toEqual([
      { status: 'stored', created: true, runId: id },
      { status: 'stored', created: false, runId: id },
      { status: 'stored', created: false, runId: id },
    ]);
    const runs = await store.runs(20);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ overall: 'pass', received_at: at(0), updated_at: at(3) });
    expect(c.change?.latest?.overall).toBe('pass');
    expect(c.change?.run.components).toEqual([
      { id: 'core', name: 'Core', status: 'pass' },
      { id: 'match', name: 'Match', status: 'pass' },
    ]);
  });

  it('merges run.steps across copies of one run: step updates, then a stage verdict without steps', async () => {
    const store = createCompatStore(dir);
    const id = 'gh-steps';
    const s = (sid: string, status: string, extra: object = {}) => ({ id: sid, name: sid, stage: 'setup', status, ...extra });
    const withSteps = (doc: TestCompatDoc, steps: object[]) => valid({ ...doc, run: { ...doc.run, steps } } as TestCompatDoc);
    const base = { run: { id, state: 'checking', started_at: at(0), finished_at: null }, overall: 'checking' } as const;

    await store.ingest(withSteps(compatDoc({ ...base, checked_at: at(0) }), [s('build', 'running'), s('selftest', 'queued'), s('record', 'queued')]), 'push');
    await store.ingest(withSteps(compatDoc({ ...base, checked_at: at(1) }), [s('build', 'pass', { finished_at: at(1) })]), 'push');
    // The selftest stage verdict: final state, no steps. The steps must survive it.
    const verdict = await store.ingest(valid(compatDoc({ run: { id, state: 'warn', started_at: at(0), finished_at: at(2) }, overall: 'warn', checked_at: at(2) })), 'push');
    expect(verdict.result.status).toBe('stored');
    expect(verdict.change?.latest?.run.steps?.map((x) => `${x.id}:${x.status}`)).toEqual(['build:pass', 'selftest:queued', 'record:queued']);
    // Summaries (the history, the stream's `run`) leave the steps out.
    expect('steps' in (verdict.change?.run.run ?? {})).toBe(false);

    // A copy that only repeats a step as it is changes nothing.
    const again = await store.ingest(withSteps(compatDoc({ run: { id, state: 'warn', started_at: at(0), finished_at: at(2) }, overall: 'warn', checked_at: at(2) }), [s('build', 'pass', { finished_at: at(1) })]), 'push');
    expect(again.result.status).toBe('unchanged');

    // And they are on disk.
    const reread = await createCompatStore(dir).latest();
    expect(reread?.run.steps).toHaveLength(3);
    expect(reread?.overall).toBe('warn');
  });

  it('ignores a copy older than the stored one (stale), and one that says nothing new (unchanged)', async () => {
    const store = createCompatStore(dir);
    const id = 'gh-7';
    const done = valid(compatDoc({ run: { id, state: 'fail' }, overall: 'fail', checked_at: at(10) }));
    const late = valid(compatDoc({ run: { id, state: 'checking', finished_at: null }, overall: 'checking', checked_at: at(5) }));
    await store.ingest(done, 'push');
    const before = await readFile(store.file, 'utf8');

    expect(await store.ingest(late, 'pull')).toEqual({ result: { status: 'stale', runId: id }, change: null });
    expect(await store.ingest(done, 'pull')).toEqual({ result: { status: 'unchanged', runId: id }, change: null });
    expect(await readFile(store.file, 'utf8')).toBe(before);
    expect((await store.latest())?.overall).toBe('fail');
  });

  it('lists newest first by start time, whatever order the runs arrive in', async () => {
    const store = createCompatStore(dir);
    for (const [id, minute] of [['b', 20], ['a', 10], ['c', 30]] as const) {
      await store.ingest(valid(compatDoc({ run: { id, started_at: at(minute) }, checked_at: at(minute) })), 'push');
    }
    expect((await store.runs(20)).map((r) => r.run.id)).toEqual(['c', 'b', 'a']);
    expect((await store.latest())?.run.id).toBe('c');
    // Summaries leave the checks out.
    expect(Object.keys((await store.runs(1))[0].components[0])).toEqual(['id', 'name', 'status']);
  });

  it(`keeps only the newest ${COMPAT_HISTORY_LIMIT} runs`, async () => {
    const store = createCompatStore(dir);
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < COMPAT_HISTORY_LIMIT + 5; i++) {
      const t = new Date(base + i * 60_000).toISOString();
      await store.ingest(valid(compatDoc({ run: { id: `r${i}`, started_at: t }, checked_at: t })), 'push');
    }
    const runs = await store.runs(COMPAT_HISTORY_LIMIT + 50);
    expect(runs).toHaveLength(COMPAT_HISTORY_LIMIT);
    expect(runs[0].run.id).toBe(`r${COMPAT_HISTORY_LIMIT + 4}`);
    expect(runs.at(-1)?.run.id).toBe('r5');
    expect(JSON.parse(await readFile(store.file, 'utf8')).runs).toHaveLength(COMPAT_HISTORY_LIMIT);

    // A run older than the whole history is stored and dropped at once: nothing to announce.
    const ancient = new Date(base - 86_400_000).toISOString();
    const outcome = await store.ingest(valid(compatDoc({ run: { id: 'ancient', started_at: ancient }, checked_at: ancient })), 'push');
    expect(outcome.change).toBeNull();
    expect((await store.runs(COMPAT_HISTORY_LIMIT)).some((r) => r.run.id === 'ancient')).toBe(false);
  });

  it('runs(limit) is clamped to 1..history', async () => {
    const store = createCompatStore(dir, { historyLimit: 3 });
    for (let i = 0; i < 4; i++) await store.ingest(valid(compatDoc({ run: { id: `x${i}`, started_at: at(i) } })), 'push');
    expect(await store.runs(0)).toHaveLength(1);
    expect(await store.runs(99)).toHaveLength(3);
  });

  it('serialises concurrent ingests, so none is lost', async () => {
    const store = createCompatStore(dir);
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.ingest(valid(compatDoc({ run: { id: `p${i}`, started_at: at(i) } })), 'push')));
    expect(await store.runs(20)).toHaveLength(10);
    expect(JSON.parse(await readFile(createCompatStore(dir).file, 'utf8')).runs).toHaveLength(10);
  });

  it('moves an unreadable file aside and starts empty; skips runs that no longer validate', async () => {
    await writeFile(path.join(dir, 'compat.json'), '{not json');
    const store = createCompatStore(dir);
    expect(await store.latest()).toBeNull();
    expect((await readdir(dir)).some((f) => f.startsWith('compat.json.unreadable-'))).toBe(true);

    const good = { ...valid(compatDoc({ run: { id: 'good' } })), source: 'push', received_at: at(0), updated_at: at(0) };
    const bad = { ...good, run: { ...good.run, id: 'bad', url: 'javascript:alert(1)' } };
    await writeFile(path.join(dir, 'compat.json'), JSON.stringify({ version: 1, runs: [good, bad] }));
    const reread = createCompatStore(dir);
    expect((await reread.runs(20)).map((r) => r.run.id)).toEqual(['good']);
  });

  it('hasPush is false while only pulled runs are stored', async () => {
    const store = createCompatStore(dir);
    await store.ingest(valid(compatDoc()), 'pull');
    expect(await store.hasPush()).toBe(false);
    await store.ingest(valid(compatDoc()), 'push');
    expect(await store.hasPush()).toBe(true);
  });
});
