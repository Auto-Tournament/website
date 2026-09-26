import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './events/route';
import { GET as getLatest } from './latest/route';
import { GET as getRuns } from './runs/route';
import { GET as getBadge } from './badge.json/route';
import { GET as getStatus } from './status/route';
import { GET as getStream } from './stream/route';
import { DEFAULT_COMPAT_FEED_URL, compatFeedSetting, isValidCompatIngestAuth } from '@/lib/compat/config';
import { COMPAT_MAX_BYTES } from '@/lib/compat/document';
import { compatListenerCount } from '@/lib/compat/events';
import { compatDoc } from '@/lib/compat/testDoc';

const TOKEN = 'test-compat-token-0123456789abcdef';

let dir: string;
let ip = 0;

function resetState() {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('autotournament.compat.state')];
}

/** A request from its own address, so the per-IP limits never get in the way. */
function post(body: unknown, headers: Record<string, string> = {}) {
  ip += 1;
  return POST(
    new Request('http://localhost/api/compat/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': `10.0.0.${ip % 250}`, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const get = (url: string) => new Request(`http://localhost${url}`, { headers: { 'x-forwarded-for': `10.1.0.${(ip += 1) % 250}` } });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'compat-routes-'));
  vi.stubEnv('COMPAT_DATA_DIR', dir);
  vi.stubEnv('COMPAT_INGEST_TOKEN', TOKEN);
  vi.stubEnv('COMPAT_FEED_URL', 'off');
  resetState();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetState();
  await rm(dir, { recursive: true, force: true });
});

describe('ingest token check', () => {
  it('accepts only Bearer <token>, and nothing while the token is unset or short', () => {
    vi.stubEnv('COMPAT_INGEST_TOKEN', 'unit-compat-token-0123456789');
    expect(isValidCompatIngestAuth('Bearer unit-compat-token-0123456789')).toBe(true);
    expect(isValidCompatIngestAuth('bearer unit-compat-token-0123456789')).toBe(true);
    expect(isValidCompatIngestAuth('Bearer unit-compat-token-012345678')).toBe(false);
    expect(isValidCompatIngestAuth('Bearer unit-compat-token-01234567890')).toBe(false);
    expect(isValidCompatIngestAuth('unit-compat-token-0123456789')).toBe(false);
    expect(isValidCompatIngestAuth('Basic unit-compat-token-0123456789')).toBe(false);
    expect(isValidCompatIngestAuth('Bearer ')).toBe(false);
    expect(isValidCompatIngestAuth(null)).toBe(false);
    expect(isValidCompatIngestAuth(undefined)).toBe(false);

    vi.stubEnv('COMPAT_INGEST_TOKEN', 'short');
    expect(isValidCompatIngestAuth('Bearer short')).toBe(false);
    vi.stubEnv('COMPAT_INGEST_TOKEN', '');
    expect(isValidCompatIngestAuth('Bearer ')).toBe(false);
  });
});

describe('feed setting', () => {
  it("reads Ready Up's published file until the first push, unless told otherwise", () => {
    vi.stubEnv('COMPAT_FEED_URL', '');
    expect(compatFeedSetting()).toEqual({ mode: 'until_push', url: DEFAULT_COMPAT_FEED_URL });
    expect(DEFAULT_COMPAT_FEED_URL).toBe('https://raw.githubusercontent.com/Auto-Tournament/ready-up/cs2-build/compat.json');
    vi.stubEnv('COMPAT_FEED_URL', 'https://example.com/compat.json');
    expect(compatFeedSetting()).toEqual({ mode: 'always', url: 'https://example.com/compat.json' });
    vi.stubEnv('COMPAT_FEED_URL', 'OFF');
    expect(compatFeedSetting().mode).toBe('off');
    vi.stubEnv('COMPAT_FEED_URL', 'file:///etc/passwd');
    expect(compatFeedSetting().mode).toBe('off');
  });
});

describe('POST /api/compat/events', () => {
  it('is 404 while COMPAT_INGEST_TOKEN is unset or shorter than 16 characters', async () => {
    vi.stubEnv('COMPAT_INGEST_TOKEN', '');
    expect((await post(compatDoc())).status).toBe(404);
    vi.stubEnv('COMPAT_INGEST_TOKEN', 'fifteen-chars!!');
    expect((await post(compatDoc(), { authorization: 'Bearer fifteen-chars!!' })).status).toBe(404);
  });

  it('is 401 without the right token, and stores nothing', async () => {
    const noAuth = await post(compatDoc(), { authorization: '' });
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get('www-authenticate')).toBe('Bearer');
    expect((await post(compatDoc(), { authorization: 'Bearer wrong-token-0123456789abcdef' })).status).toBe(401);
    expect((await post(compatDoc(), { authorization: TOKEN })).status).toBe(401);
    const latest = await (await getLatest(get('/api/compat/latest'))).json();
    expect(latest).toEqual({ success: true, latest: null });
  });

  it('refuses a body that is not JSON, too large, or not a schema-1 document', async () => {
    expect((await post(compatDoc(), { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post('{nope')).status).toBe(400);
    expect((await post(`"${'x'.repeat(COMPAT_MAX_BYTES)}"`)).status).toBe(413);
    const invalid = await post({ ...compatDoc(), overall: 'great' });
    expect(invalid.status).toBe(400);
    const body = await invalid.json();
    expect(body.error).toBe('invalid_document');
    expect(body.details.some((d: string) => d.startsWith('overall:'))).toBe(true);
  });

  it('stores a run, then answers unchanged and stale, and keeps it on disk', async () => {
    const doc = compatDoc({ run: { id: 'gh-1' }, checked_at: '2026-09-25T12:05:00Z' });
    const first = await post(doc);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: true, status: 'stored', created: true, runId: 'gh-1' });
    expect(await (await post(doc)).json()).toMatchObject({ status: 'unchanged' });
    const older = { ...doc, overall: 'checking', checked_at: '2026-09-25T12:00:00Z' };
    expect(await (await post(older)).json()).toMatchObject({ status: 'stale' });

    const onDisk = JSON.parse(await readFile(path.join(dir, 'compat.json'), 'utf8'));
    expect(onDisk.runs).toHaveLength(1);
    expect(onDisk.runs[0]).toMatchObject({ overall: 'pass', source: 'push' });
  });

  it('accepts a queued event with an empty cs2.patch', async () => {
    const queued = compatDoc({ cs2: { patch: '' }, run: { state: 'queued', finished_at: null }, overall: 'checking' });
    queued.components = queued.components.map((c) => ({ ...c, status: 'checking', checks: [] }));
    const res = await post(queued);
    expect(res.status).toBe(200);
    const badge = await (await getBadge(get('/api/compat/badge.json'))).json();
    expect(badge).toMatchObject({ schemaVersion: 1, label: 'Ready Up', message: 'checking · CS2 build 25537370', color: 'blue' });
  });
});

describe('public reads', () => {
  it('latest, runs and the badge follow what was pushed', async () => {
    expect(await (await getBadge(get('/api/compat/badge.json'))).json()).toMatchObject({ message: 'unknown', color: 'lightgrey' });
    expect(await (await getStatus(get('/api/compat/status'))).json()).toEqual({
      success: true,
      status: { overall: null, cs2: null, checked_at: null },
    });
    await post(compatDoc({ run: { id: 'old', started_at: '2026-09-24T10:00:00Z' }, overall: 'fail', checked_at: '2026-09-24T10:05:00Z' }));
    await post(compatDoc({ run: { id: 'new', started_at: '2026-09-25T10:00:00Z' }, overall: 'warn', checked_at: '2026-09-25T10:05:00Z' }));

    const latestRes = await getLatest(get('/api/compat/latest'));
    expect(latestRes.headers.get('cache-control')).toBe('no-cache');
    const { latest } = await latestRes.json();
    expect(latest.run.id).toBe('new');
    expect(latest.components[0].checks.length).toBeGreaterThan(0);

    const { runs } = await (await getRuns(get('/api/compat/runs?limit=5'))).json();
    expect(runs.map((r: { run: { id: string } }) => r.run.id)).toEqual(['new', 'old']);
    expect(runs[0].components[0]).toEqual({ id: 'core', name: 'Core', status: 'pass' });

    const badgeRes = await getBadge(get('/api/compat/badge.json'));
    expect(badgeRes.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await badgeRes.json()).toEqual({ schemaVersion: 1, label: 'Ready Up', message: 'static ok · CS2 1.41.8.5', color: 'yellow', cacheSeconds: 300 });

    const statusRes = await getStatus(get('/api/compat/status'));
    expect(statusRes.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await statusRes.json()).toEqual({
      success: true,
      status: { overall: 'warn', cs2: { buildid: latest.cs2.buildid, patch: '1.41.8.5' }, checked_at: '2026-09-25T10:05:00.000Z' },
    });
  });

  it('runs refuses a limit outside 1..200', async () => {
    for (const bad of ['0', '201', 'abc', '-1', '1.5']) {
      expect((await getRuns(get(`/api/compat/runs?limit=${bad}`))).status, bad).toBe(400);
    }
    expect((await getRuns(get('/api/compat/runs?limit=200'))).status).toBe(200);
  });
});

describe('GET /api/compat/stream', () => {
  async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string, seen = { text: '' }) {
    const decoder = new TextDecoder();
    while (!seen.text.includes(needle)) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`stream ended before ${needle}`);
      seen.text += decoder.decode(value);
    }
    return seen;
  }

  it('sends a snapshot on connect, an update on every ingest, and cleans up on disconnect', async () => {
    await post(compatDoc({ run: { id: 'first' } }));
    const controller = new AbortController();
    const listenersBefore = compatListenerCount();
    const res = await getStream(new Request('http://localhost/api/compat/stream', { signal: controller.signal, headers: { 'x-forwarded-for': '10.9.9.9' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toContain('no-transform');
    expect(compatListenerCount()).toBe(listenersBefore + 1);

    const reader = res.body!.getReader();
    const seen = await readUntil(reader, 'event: snapshot');
    expect(seen.text.startsWith('retry: 10000\n\n')).toBe(true);
    await readUntil(reader, '\n\n', { text: seen.text.slice(seen.text.indexOf('event: snapshot')) });

    await post(compatDoc({ run: { id: 'second', state: 'checking', finished_at: null }, overall: 'checking' }));
    const update = await readUntil(reader, '"id":"second"');
    const line = update.text.split('\n').find((l) => l.startsWith('data:') && l.includes('"second"'))!;
    const event = JSON.parse(line.slice(5));
    expect(event.run.run.id).toBe('second');
    expect(event.latest.run.id).toBeDefined();

    controller.abort();
    expect(compatListenerCount()).toBe(listenersBefore);
    await reader.cancel().catch(() => {});
  });

  it('refuses more than 8 streams from one address', async () => {
    const controllers: AbortController[] = [];
    const open = async () => {
      const c = new AbortController();
      controllers.push(c);
      return getStream(new Request('http://localhost/api/compat/stream', { signal: c.signal, headers: { 'x-forwarded-for': '10.8.8.8' } }));
    };
    for (let i = 0; i < 8; i++) expect((await open()).status).toBe(200);
    expect((await open()).status).toBe(503);
    controllers.forEach((c) => c.abort());
    expect((await open()).status).toBe(200);
    controllers.forEach((c) => c.abort());
  });
});

describe('published compat.json fallback', () => {
  let server: http.Server;
  let hits = 0;
  let feedDoc = compatDoc();

  beforeEach(async () => {
    hits = 0;
    feedDoc = compatDoc({ run: { id: 'published' }, overall: 'warn' });
    server = http.createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(feedDoc));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });
  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('shows the published file while nothing is stored, at most one fetch per five minutes', async () => {
    vi.stubEnv('COMPAT_FEED_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}/compat.json`);
    const { latest } = await (await getLatest(get('/api/compat/latest'))).json();
    expect(latest).toMatchObject({ source: 'pull', overall: 'warn' });
    expect(latest.run.id).toBe('published');
    await getLatest(get('/api/compat/latest'));
    await getRuns(get('/api/compat/runs'));
    expect(hits).toBe(1);
  });

  it('keeps the last good run when the feed breaks', async () => {
    vi.stubEnv('COMPAT_FEED_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}/compat.json`);
    await getLatest(get('/api/compat/latest'));
    feedDoc = { ...feedDoc, overall: 'nonsense' };
    const state = (globalThis as Record<symbol, { feed: { lastAttemptAt: number } }>)[Symbol.for('autotournament.compat.state')];
    state.feed.lastAttemptAt = 0;
    await getLatest(get('/api/compat/latest'));
    await new Promise((r) => setTimeout(r, 50));
    const { latest } = await (await getLatest(get('/api/compat/latest'))).json();
    expect(latest.overall).toBe('warn');
    expect(hits).toBe(2);
  });
});
