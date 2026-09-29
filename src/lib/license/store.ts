import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db as sharedDb, type Db } from '../db/client';
import { licenses, manualOrders, type LicenseSource, type RevokeReason } from '../db/schema';
import type { LicensePayload } from './format';

/**
 * Issued license keys, one per Stripe Checkout Session, in Postgres (the
 * `licenses` table). Until the console, they lived in licenses.json; that
 * file is imported at startup (importLicenseFile) and left untouched as a
 * backup.
 *
 * It keeps a SHA-256 of the buyer's email (to check a retrieval request and
 * to show signed-in users the licenses bought with their verified email),
 * never the email itself.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */

export type LicenseRecord = {
  /** Stripe Checkout Session id: one key per session. */
  session_id: string;
  /** The invoice number from Stripe's receipt (e.g. ABCD1234-0001), when known. */
  invoice_number: string | null;
  email_sha256: string | null;
  /** The buyer's own name from the checkout form's "Your name" field. Null: not given, or issued before this column existed. */
  buyer_name?: string | null;
  livemode: boolean;
  /** Whether the event dates came from the checkout form (false: 5 days from the purchase day). */
  dates_from_form: boolean;
  payload: LicensePayload;
  token: string;
  /** When the key was first emailed to the buyer (ISO 8601). Unset: not yet. */
  emailed_at?: string | null;
  /** The last failed send: when, and the error (never the address). Cleared once a send works. */
  email_error?: string | null;
  /** The console organization the license belongs to, when it was added to one. */
  org_id?: string | null;
  /** The Checkout Session's amount_total, in minor units of `currency`. Null on rows issued before this column existed. */
  amount_total?: number | null;
  /** Lowercase ISO 4217, e.g. 'eur'. Null alongside a null amount_total. */
  currency?: string | null;
  /** When Stripe considers the session paid (ISO 8601). Falls back to payload.issued_at when unknown. */
  paid_at?: string | null;
  /** 'stripe' (default) or 'manual' (bank transfer / invoice, from the admin CRM). */
  source?: LicenseSource;
  /** Bank transfer / invoice reference (manual licenses and paid reissues). */
  payment_ref?: string | null;
  /** The license id this one replaced, and the one that replaced it (admin reissue). */
  supersedes?: string | null;
  superseded_by?: string | null;
  /** Marked refunded or revoked in the admin CRM (ISO 8601), and which. */
  revoked_at?: string | null;
  revoke_reason?: RevokeReason | null;
  /** The Stripe PaymentIntent that paid the session, when known. */
  payment_intent?: string | null;
  /** Given back so far, minor units of `currency` (null: nothing), and when last. */
  refunded_amount?: number | null;
  refunded_at?: string | null;
};

export interface LicenseStore {
  bySession(sessionId: string): Promise<LicenseRecord | null>;
  /**
   * By session id or invoice number, only when the email hash matches too.
   * A reissued license leads to its newest replacement; a revoked or refunded
   * one isn't found.
   */
  find(reference: string, emailSha256: string): Promise<LicenseRecord | null>;
  /**
   * Returns the session's record, creating it with `create` only when there is
   * none. Runs under a per-session advisory lock, so two callers (the webhook
   * and the thanks page, even in two processes) end with one key and `create`
   * runs once.
   */
  issueOnce(sessionId: string, create: () => Promise<LicenseRecord>): Promise<{ record: LicenseRecord; created: boolean }>;
  /** Every license bought with this email (by hash), newest first. */
  forEmail(emailSha256: string): Promise<LicenseRecord[]>;
  /** By license id (L-…), for the public check page. */
  byLicenseId(id: string): Promise<LicenseRecord | null>;
  /**
   * Founding supporter places taken (the founder cap): live-mode founder
   * licenses that weren't replaced by a reissue (the replacement counts
   * instead) or refunded, plus unpaid manual founder orders, which hold a
   * place until they are paid or cancelled.
   */
  founderCount(): Promise<number>;
  /**
   * Claims the right to email this license's key: the record, or null when
   * there is no such license, a send is already running, or (unless `again`)
   * it was already emailed. Call finishEmail afterwards, always.
   */
  claimEmail(sessionId: string, options?: { again?: boolean }): Promise<LicenseRecord | null>;
  /** Records how a claimed send went, and releases the claim. */
  finishEmail(sessionId: string, result: { ok: true; at: string } | { ok: false; at: string; error: string }): Promise<void>;
  /** Adds records that aren't there yet (by session id); returns how many were new. */
  importRecords(records: LicenseRecord[]): Promise<number>;
}

/** A send claimed longer ago than this is treated as abandoned (the process died mid-send). */
const CLAIM_TTL_MS = 5 * 60_000;

type Row = typeof licenses.$inferSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function fromRow(row: Row): LicenseRecord {
  return {
    session_id: row.sessionId,
    invoice_number: row.invoiceNumber,
    email_sha256: row.emailHash,
    buyer_name: row.buyerName,
    livemode: row.livemode,
    dates_from_form: row.datesFromForm,
    payload: row.payload,
    token: row.token,
    emailed_at: iso(row.emailedAt),
    email_error: row.emailError,
    org_id: row.orgId,
    amount_total: row.amountTotal,
    currency: row.currency,
    paid_at: iso(row.paidAt),
    source: row.source,
    payment_ref: row.paymentRef,
    supersedes: row.supersedes,
    superseded_by: row.supersededBy,
    revoked_at: iso(row.revokedAt),
    revoke_reason: row.revokeReason,
    payment_intent: row.paymentIntent,
    refunded_amount: row.refundedAmount,
    refunded_at: iso(row.refundedAt),
  };
}

export function toRow(r: LicenseRecord): typeof licenses.$inferInsert {
  return {
    sessionId: r.session_id,
    licenseId: r.payload.id,
    invoiceNumber: r.invoice_number,
    emailHash: r.email_sha256,
    buyerName: r.buyer_name ?? null,
    livemode: r.livemode,
    datesFromForm: r.dates_from_form,
    kind: r.payload.kind,
    issuedAt: new Date(r.payload.issued_at),
    payload: r.payload,
    token: r.token,
    emailedAt: r.emailed_at ? new Date(r.emailed_at) : null,
    emailError: r.email_error ?? null,
    orgId: r.org_id ?? null,
    amountTotal: r.amount_total ?? null,
    currency: r.currency ?? null,
    paidAt: r.paid_at ? new Date(r.paid_at) : null,
    source: r.source ?? 'stripe',
    paymentRef: r.payment_ref ?? null,
    supersedes: r.supersedes ?? null,
    supersededBy: r.superseded_by ?? null,
    revokedAt: r.revoked_at ? new Date(r.revoked_at) : null,
    revokeReason: r.revoke_reason ?? null,
    paymentIntent: r.payment_intent ?? null,
    refundedAmount: r.refunded_amount ?? null,
    refundedAt: r.refunded_at ? new Date(r.refunded_at) : null,
  };
}

export function createLicenseStore(db: Db): LicenseStore {
  const one = async (rows: Promise<Row[]>) => {
    const [row] = await rows;
    return row ? fromRow(row) : null;
  };

  return {
    bySession(sessionId) {
      return one(db.select().from(licenses).where(eq(licenses.sessionId, sessionId)).limit(1));
    },
    async find(reference, emailSha256) {
      const ref = reference.trim();
      let found = await one(
        db
          .select()
          .from(licenses)
          .where(
            and(
              or(eq(licenses.sessionId, ref), sql`upper(${licenses.invoiceNumber}) = ${ref.toUpperCase()}`),
              // Compared in the database: both are hex SHA-256 of an email, not secrets.
              eq(licenses.emailHash, emailSha256),
            ),
          )
          .orderBy(asc(licenses.issuedAt))
          .limit(1),
      );
      // A reissue replaced it: the newest key (a short chain; the cap guards against a loop).
      for (let hops = 0; found?.superseded_by && hops < 20; hops++) {
        const next = await one(db.select().from(licenses).where(and(eq(licenses.licenseId, found.superseded_by), eq(licenses.emailHash, emailSha256))).limit(1));
        if (!next) break;
        found = next;
      }
      return found && !found.revoked_at ? found : null;
    },
    async forEmail(emailSha256) {
      const rows = await db.select().from(licenses).where(eq(licenses.emailHash, emailSha256)).orderBy(desc(licenses.issuedAt));
      return rows.map(fromRow);
    },
    byLicenseId(id) {
      return one(db.select().from(licenses).where(eq(licenses.licenseId, id)).limit(1));
    },
    async founderCount() {
      const [issued] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(licenses)
        .where(
          and(
            eq(licenses.livemode, true),
            eq(licenses.kind, 'founder'),
            isNull(licenses.supersededBy),
            or(isNull(licenses.revokeReason), sql`${licenses.revokeReason} <> 'refunded'`),
          ),
        );
      const [pending] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(manualOrders)
        .where(and(eq(manualOrders.status, 'unpaid'), eq(manualOrders.kind, 'founder')));
      return Number(issued?.n ?? 0) + Number(pending?.n ?? 0);
    },
    claimEmail(sessionId, options = {}) {
      const stale = new Date(Date.now() - CLAIM_TTL_MS);
      return one(
        db
          .update(licenses)
          .set({ emailClaimedAt: new Date() })
          .where(
            and(
              eq(licenses.sessionId, sessionId),
              or(isNull(licenses.emailClaimedAt), lt(licenses.emailClaimedAt, stale)),
              options.again ? undefined : isNull(licenses.emailedAt),
            ),
          )
          .returning(),
      );
    },
    async finishEmail(sessionId, result) {
      await db
        .update(licenses)
        .set(
          result.ok
            ? { emailedAt: sql`coalesce(${licenses.emailedAt}, ${new Date(result.at).toISOString()}::timestamptz)`, emailError: null, emailClaimedAt: null }
            : { emailError: `${result.at} ${result.error}`.slice(0, 200), emailClaimedAt: null },
        )
        .where(eq(licenses.sessionId, sessionId));
    },
    issueOnce(sessionId, create) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`license:${sessionId}`}, 0))`);
        const [existing] = await tx.select().from(licenses).where(eq(licenses.sessionId, sessionId)).limit(1);
        if (existing) return { record: fromRow(existing), created: false };
        const record = await create();
        // In the same transaction: when the insert fails, nothing was issued.
        await tx.insert(licenses).values(toRow(record));
        return { record, created: true };
      });
    },
    async importRecords(records) {
      let added = 0;
      // Small batches keep each statement well under Postgres' parameter limit.
      for (let i = 0; i < records.length; i += 200) {
        const rows = await db
          .insert(licenses)
          .values(records.slice(i, i + 200).map(toRow))
          .onConflictDoNothing()
          .returning({ sessionId: licenses.sessionId });
        added += rows.length;
      }
      return added;
    },
  };
}

// ---------------------------------------------------------------------------
// The old licenses.json

export const DEFAULT_LICENSE_DATA_DIR = './data/licenses';
export const LICENSE_FILE_NAME = 'licenses.json';
const FILE_VERSION = 1;

export function licenseDataDir(): string {
  const raw = (process.env.LICENSE_DATA_DIR ?? '').trim() || DEFAULT_LICENSE_DATA_DIR;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), raw);
}

/**
 * Imports licenses.json into the database: every record whose session isn't
 * there yet. Safe to run on every start (it only adds, and a license already
 * in the database is never changed). The file is read, never written. Returns
 * { inFile, imported }, or null when there is no file. Throws on a file that
 * isn't a license store: these are paid keys.
 */
export async function importLicenseFile(store: LicenseStore, dir: string): Promise<{ inFile: number; imported: number } | null> {
  let text: string;
  try {
    text = await readFile(path.join(dir, LICENSE_FILE_NAME), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const parsed = JSON.parse(text) as { version?: unknown; licenses?: unknown };
  if (parsed?.version !== FILE_VERSION || !Array.isArray(parsed.licenses)) throw new Error(`${LICENSE_FILE_NAME} is not a license store`);
  const records = (parsed.licenses as LicenseRecord[]).filter((r) => typeof r?.session_id === 'string' && typeof r?.payload?.id === 'string');
  return { inFile: records.length, imported: await store.importRecords(records) };
}

let shared: { db: Db; store: LicenseStore } | null = null;

/** The store on the shared database (DATABASE_URL). Throws when it isn't set. */
export function licenseStore(): LicenseStore {
  const current = sharedDb();
  if (shared?.db !== current) shared = { db: current, store: createLicenseStore(current) };
  return shared.store;
}
