import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../atomicWrite';

/**
 * Sign-in links and sessions for /account, in account.json next to
 * licenses.json: read once, served from memory, every change written
 * atomically (mode 600) and one at a time. Only SHA-256 hashes of the link
 * tokens and session ids are kept, with the buyer's email hash (as in
 * licenses.json, never the email). Expired entries are dropped on every
 * write. Nothing here is precious: an unreadable file starts over (everyone
 * signs in again).
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */

const FILE_NAME = 'account.json';
const FILE_VERSION = 1;
export const TOKEN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** Bounds the file: the oldest entries go first. */
const MAX_TOKENS = 5_000;
const MAX_SESSIONS = 20_000;

type Entry = { hash: string; email_sha256: string; expires_at: number };
type StoreFile = { version: typeof FILE_VERSION; tokens: Entry[]; sessions: Entry[] };

export interface AccountStore {
  readonly file: string;
  /** A new single-use sign-in token for this email hash, valid 15 minutes. Returns the token (only its hash is kept). */
  createToken(emailSha256: string, now?: number): Promise<string>;
  /** Uses up a sign-in token and starts a 30-day session: the session id, or null when the token is unknown, used or expired. */
  signIn(token: string, now?: number): Promise<{ sessionId: string; emailSha256: string } | null>;
  /** The email hash of a live session, or null. */
  session(sessionId: string, now?: number): Promise<string | null>;
  deleteSession(sessionId: string): Promise<void>;
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function sameHex(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Finds the entry by hash with a timing-safe compare on every entry. */
function findIndex(list: Entry[], hash: string): number {
  let found = -1;
  for (let i = 0; i < list.length; i++) if (sameHex(list[i].hash, hash)) found = i;
  return found;
}

export function createAccountStore(dir: string): AccountStore {
  const file = path.join(dir, FILE_NAME);
  let state: StoreFile | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<StoreFile> {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<StoreFile>;
      if (parsed?.version === FILE_VERSION && Array.isArray(parsed.tokens) && Array.isArray(parsed.sessions)) {
        return { version: FILE_VERSION, tokens: parsed.tokens, sessions: parsed.sessions };
      }
      console.warn('[account] account.json is not an account store; starting empty');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[account] could not read account.json; starting empty', err instanceof Error ? err.name : '');
    }
    return { version: FILE_VERSION, tokens: [], sessions: [] };
  }

  async function current(): Promise<StoreFile> {
    state ??= await load();
    return state;
  }

  async function save(next: StoreFile, now: number): Promise<void> {
    const live = (list: Entry[], max: number) => list.filter((e) => e.expires_at > now).slice(-max);
    const pruned: StoreFile = { version: FILE_VERSION, tokens: live(next.tokens, MAX_TOKENS), sessions: live(next.sessions, MAX_SESSIONS) };
    await writeFileAtomic(dir, FILE_NAME, `${JSON.stringify(pruned)}\n`);
    state = pruned;
  }

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  return {
    file,
    createToken(emailSha256, now = Date.now()) {
      return serial(async () => {
        const s = await current();
        const token = randomBytes(32).toString('base64url');
        await save({ ...s, tokens: [...s.tokens, { hash: sha256(token), email_sha256: emailSha256, expires_at: now + TOKEN_TTL_MS }] }, now);
        return token;
      });
    },
    signIn(token, now = Date.now()) {
      return serial(async () => {
        const s = await current();
        const i = findIndex(s.tokens, sha256(token));
        if (i < 0) return null;
        const entry = s.tokens[i];
        const tokens = s.tokens.filter((_, j) => j !== i);
        if (entry.expires_at <= now) {
          await save({ ...s, tokens }, now);
          return null;
        }
        const sessionId = randomBytes(32).toString('base64url');
        const session: Entry = { hash: sha256(sessionId), email_sha256: entry.email_sha256, expires_at: now + SESSION_TTL_MS };
        // One write: the token is gone the moment the session exists.
        await save({ ...s, tokens, sessions: [...s.sessions, session] }, now);
        return { sessionId, emailSha256: entry.email_sha256 };
      });
    },
    session(sessionId, now = Date.now()) {
      return serial(async () => {
        const s = await current();
        const i = findIndex(s.sessions, sha256(sessionId));
        return i >= 0 && s.sessions[i].expires_at > now ? s.sessions[i].email_sha256 : null;
      });
    },
    deleteSession(sessionId) {
      return serial(async () => {
        const s = await current();
        const i = findIndex(s.sessions, sha256(sessionId));
        if (i < 0) return;
        await save({ ...s, sessions: s.sessions.filter((_, j) => j !== i) }, Date.now());
      });
    },
  };
}
