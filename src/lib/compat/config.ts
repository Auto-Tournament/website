import 'server-only';
import crypto from 'node:crypto';
import path from 'node:path';

/**
 * Ready Up compatibility settings, all read from the environment at runtime:
 *
 * - `COMPAT_INGEST_TOKEN`: the Bearer token Ready Up's CI sends to
 *   `POST /api/compat/events`. Unset (or shorter than 16 characters) means
 *   the endpoint answers 404, as if it did not exist.
 * - `COMPAT_DATA_DIR`: where the runs are kept. Defaults to `./data/compat`
 *   (in the container: /app/data/compat, a Docker volume).
 * - `COMPAT_FEED_URL`: the published compat.json to read when no push has
 *   arrived yet. Defaults to Ready Up's file on its `cs2-build` branch. Set
 *   it to read that URL even after pushes arrive, or to `off` to never read it.
 */

export const COMPAT_MIN_TOKEN_LENGTH = 16;

export const DEFAULT_COMPAT_FEED_URL = 'https://raw.githubusercontent.com/Auto-Tournament/ready-up/cs2-build/compat.json';

export const DEFAULT_COMPAT_DATA_DIR = './data/compat';

/** The ingest token, or null when unset or too short to be safe (push disabled). */
export function compatIngestToken(): string | null {
  const token = (process.env.COMPAT_INGEST_TOKEN ?? '').trim();
  return token.length >= COMPAT_MIN_TOKEN_LENGTH ? token : null;
}

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Whether `authorization` (the raw header) is `Bearer <COMPAT_INGEST_TOKEN>`.
 * Compared in constant time over SHA-256 digests, so neither the token nor
 * its length leaks through timing.
 */
export function isValidCompatIngestAuth(authorization: string | null | undefined): boolean {
  const expected = compatIngestToken();
  if (!expected || typeof authorization !== 'string') return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  const presented = match ? match[1] : '';
  // Always compare, even with nothing presented, so a missing token takes as long as a wrong one.
  const same = crypto.timingSafeEqual(sha256(presented), sha256(expected));
  return same && presented.length > 0;
}

export type CompatFeedSetting =
  /** COMPAT_FEED_URL is set: always read it. */
  | { mode: 'always'; url: string }
  /** Not set: read Ready Up's published file until the first push arrives. */
  | { mode: 'until_push'; url: string }
  /** `off`, or not an http(s) URL. */
  | { mode: 'off'; url: null };

export function compatFeedSetting(): CompatFeedSetting {
  const raw = (process.env.COMPAT_FEED_URL ?? '').trim();
  if (!raw) return { mode: 'until_push', url: DEFAULT_COMPAT_FEED_URL };
  if (raw.toLowerCase() === 'off') return { mode: 'off', url: null };
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') return { mode: 'always', url: url.toString() };
  } catch {
    // Reported below.
  }
  return { mode: 'off', url: null };
}

/** Absolute path of the data directory. */
export function compatDataDir(): string {
  const raw = (process.env.COMPAT_DATA_DIR ?? '').trim() || DEFAULT_COMPAT_DATA_DIR;
  // turbopackIgnore: a runtime data path, not something to trace into the standalone build.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), raw);
}

let reported = false;

/** Logs once per process what is set and why a value was ignored. */
export function reportCompatConfig(): void {
  if (reported) return;
  reported = true;
  const rawToken = (process.env.COMPAT_INGEST_TOKEN ?? '').trim();
  if (rawToken && !compatIngestToken()) {
    console.warn(
      `[compat] COMPAT_INGEST_TOKEN is shorter than ${COMPAT_MIN_TOKEN_LENGTH} characters and was ignored: POST /api/compat/events stays off. ` +
        'Generate one with `openssl rand -hex 32`.',
    );
  }
  const rawFeed = (process.env.COMPAT_FEED_URL ?? '').trim();
  if (rawFeed && rawFeed.toLowerCase() !== 'off' && compatFeedSetting().mode === 'off') {
    console.warn('[compat] COMPAT_FEED_URL is not an http(s) URL and was ignored; the published compat.json is not read.');
  }
}
