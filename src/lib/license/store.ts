import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { LicensePayload } from './format';

/**
 * Issued license keys, one per Stripe Checkout Session, kept in one small JSON
 * file like the compat store (lib/compat/store.ts): read once, then served
 * from memory; every change is written to a temporary file and renamed over
 * the old one. Writes run one at a time, so the webhook and the thanks page
 * issuing for the same session at once still end with one key.
 *
 * It keeps a SHA-256 of the buyer's email (to check a retrieval request),
 * never the email itself. The file is readable by the site's user only.
 */

const FILE_NAME = 'licenses.json';
const FILE_VERSION = 1;

export type LicenseRecord = {
  /** Stripe Checkout Session id: one key per session. */
  session_id: string;
  /** The invoice number from Stripe's receipt (e.g. ABCD1234-0001), when known. */
  invoice_number: string | null;
  email_sha256: string | null;
  livemode: boolean;
  /** Whether the event dates came from the checkout form (false: 5 days from the purchase day). */
  dates_from_form: boolean;
  payload: LicensePayload;
  token: string;
};

type StoreFile = { version: typeof FILE_VERSION; licenses: LicenseRecord[] };

export interface LicenseStore {
  readonly file: string;
  bySession(sessionId: string): Promise<LicenseRecord | null>;
  /** By session id or invoice number, only when the email hash matches too. */
  find(reference: string, emailSha256: string): Promise<LicenseRecord | null>;
  /** Returns the session's record, creating it with `create` only when there is none. */
  issueOnce(sessionId: string, create: () => Promise<LicenseRecord>): Promise<{ record: LicenseRecord; created: boolean }>;
}

function sameHash(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createLicenseStore(dir: string): LicenseStore {
  const file = path.join(dir, FILE_NAME);
  let records: LicenseRecord[] | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<LicenseRecord[]> {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const parsed = JSON.parse(text) as Partial<StoreFile>;
    // Never start over silently: these are paid keys. A broken file stops issuing until someone looks.
    if (parsed?.version !== FILE_VERSION || !Array.isArray(parsed.licenses)) throw new Error(`${file} is not a license store`);
    return parsed.licenses;
  }

  async function current(): Promise<LicenseRecord[]> {
    records ??= await load();
    return records;
  }

  async function persist(next: LicenseRecord[]): Promise<void> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const body = `${JSON.stringify({ version: FILE_VERSION, licenses: next } satisfies StoreFile, null, 1)}\n`;
    const tmp = path.join(dir, `.${FILE_NAME}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      const handle = await open(tmp, 'w', 0o600);
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

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  return {
    file,
    bySession(sessionId) {
      return serial(async () => (await current()).find((r) => r.session_id === sessionId) ?? null);
    },
    find(reference, emailSha256) {
      return serial(async () => {
        const ref = reference.trim();
        const upper = ref.toUpperCase();
        const match = (await current()).find((r) => r.session_id === ref || (r.invoice_number !== null && r.invoice_number.toUpperCase() === upper));
        return match && sameHash(match.email_sha256, emailSha256) ? match : null;
      });
    },
    issueOnce(sessionId, create) {
      return serial(async () => {
        const list = await current();
        const existing = list.find((r) => r.session_id === sessionId);
        if (existing) return { record: existing, created: false };
        const record = await create();
        const next = [...list, record];
        // Disk first: when the write fails, nothing was issued.
        await persist(next);
        records = next;
        return { record, created: true };
      });
    },
  };
}

export const DEFAULT_LICENSE_DATA_DIR = './data/licenses';

export function licenseDataDir(): string {
  const raw = (process.env.LICENSE_DATA_DIR ?? '').trim() || DEFAULT_LICENSE_DATA_DIR;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), raw);
}

let shared: LicenseStore | null = null;

export function licenseStore(): LicenseStore {
  shared ??= createLicenseStore(licenseDataDir());
  return shared;
}
