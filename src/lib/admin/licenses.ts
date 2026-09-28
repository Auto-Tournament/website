/**
 * The admin CRM's license work: the list and detail, reissue, refund/revoke,
 * notes, and manual (bank transfer / invoice) orders. Callers check that the
 * user is an admin (src/lib/admin/guard.ts) before calling any of these;
 * every write goes into audit_log with the admin as the actor, in the same
 * transaction.
 *
 * Keys are never deleted. A reissue signs a new key and marks the old row
 * superseded_by the new one: the old key keeps working offline (that is the
 * trust model), and /verify says "replaced by". Refund/revoke only sets
 * revoked_at: /verify says "revoked".
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { adminNotes, auditLog, licenses, manualOrders, organizations, users, type LicenseSource, type RevokeReason } from '../db/schema';
import { audit, type Tx } from '../console/audit';
import { isUuid } from '../console/orgs';
import { founderSalesOpen, type PackProduct, type PackSize, type Period } from '../../components/pricing';
import { addDays, addMonths, emailHash, EVENT_MAX_DAYS, isPeriod, LIFETIME, signLicense, type LicensePayload, type SigningKey } from '../license/format';
import { licenseStatus } from '../license/describe';
import { createLicenseStore, fromRow, toRow, type LicenseRecord } from '../license/store';
import { isCurrency, type Currency } from '../license/sales';

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminError';
  }
}

export type Actor = { id: string };

const newLicenseId = () => `L-${randomBytes(9).toString('base64url')}`;

const lock = (tx: Tx, key: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);

/** One line, trimmed, capped; null when empty. */
export function line(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** Multi-line text (notes), trimmed, capped; null when empty. */
export function textBlock(v: unknown, max = 4000): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const isProduct = (v: unknown): v is PackProduct => v === 'servers' || v === 'platform';
export const isPackSize = (v: unknown): v is PackSize => v === 'S' || v === 'M' || v === 'L';

// ---------------------------------------------------------------------------
// Status

export type AdminStatus = 'active' | 'upcoming' | 'expired' | 'updates-ended' | 'test' | 'replaced' | 'refunded' | 'revoked';

export const adminStatusLabel: Record<AdminStatus, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  expired: 'Expired',
  'updates-ended': 'Updates ended',
  test: 'Test',
  replaced: 'Replaced',
  refunded: 'Refunded',
  revoked: 'Revoked',
};

export function adminStatus(r: Pick<LicenseRecord, 'payload' | 'livemode' | 'superseded_by' | 'revoke_reason' | 'revoked_at'>, today: string): AdminStatus {
  if (r.revoked_at) return r.revoke_reason === 'refunded' ? 'refunded' : 'revoked';
  if (r.superseded_by) return 'replaced';
  if (!r.livemode) return 'test';
  return licenseStatus(r.payload, today);
}

/** The day a license stops: the event's last day, or a yearly license's updates end. Null for founder licenses. */
export function endsOn(p: LicensePayload): string | null {
  if (p.kind === 'event') return p.valid_to ?? p.updates_until;
  if (p.kind === 'year') return p.updates_until;
  return null;
}

// ---------------------------------------------------------------------------
// Founder numbers

/**
 * Founder numbers (#1, #2, …) by order of the first key. A reissue keeps the
 * number of the license it replaced; a license upgraded to founder by a
 * reissue gets the next number at the time of the reissue.
 */
export async function founderNumbers(db: Db | Tx): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: licenses.licenseId, kind: licenses.kind, supersedes: licenses.supersedes, issuedAt: licenses.issuedAt })
    .from(licenses)
    .where(eq(licenses.livemode, true))
    .orderBy(asc(licenses.issuedAt), asc(licenses.licenseId));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const numbers = new Map<string, number>();
  let next = 1;
  for (const r of rows) {
    if (r.kind !== 'founder') continue;
    const prev = r.supersedes ? byId.get(r.supersedes) : undefined;
    const inherited = prev && prev.kind === 'founder' ? numbers.get(prev.id) : undefined;
    numbers.set(r.id, inherited ?? next++);
  }
  return numbers;
}

// ---------------------------------------------------------------------------
// List

export type LicenseFilters = {
  q?: string;
  status?: AdminStatus | 'current' | '';
  kind?: string;
  product?: string;
  source?: string;
};

export type LicenseRow = {
  record: LicenseRecord;
  status: AdminStatus;
  orgId: string | null;
  orgName: string | null;
  founderNumber: number | null;
};

export const LIST_LIMIT = 500;

/** Licenses, newest first, filtered. `q` matches the licensee, license id, order reference, invoice, payment reference or organization. */
export async function listLicenses(db: Db, filters: LicenseFilters, today: string): Promise<{ rows: LicenseRow[]; more: boolean }> {
  const where: SQL[] = [];
  const q = line(filters.q, 120);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        ilike(sql`${licenses.payload}->>'licensee'`, like),
        ilike(licenses.licenseId, like),
        ilike(licenses.sessionId, like),
        ilike(licenses.invoiceNumber, like),
        ilike(licenses.paymentRef, like),
        ilike(organizations.name, like),
        ilike(sql`${licenses.payload}->>'customer'`, like),
      ) as SQL,
    );
  }
  if (filters.kind && isPeriod(filters.kind)) where.push(eq(licenses.kind, filters.kind));
  if (filters.product && isProduct(filters.product)) where.push(sql`${licenses.payload}->>'product' = ${filters.product}`);
  if (filters.source === 'stripe' || filters.source === 'manual') where.push(eq(licenses.source, filters.source));
  const rows = await db
    .select({ license: licenses, orgName: organizations.name })
    .from(licenses)
    .leftJoin(organizations, eq(organizations.id, licenses.orgId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(licenses.issuedAt))
    .limit(LIST_LIMIT * 4);
  const numbers = await founderNumbers(db);
  let out = rows.map(({ license, orgName }) => {
    const record = fromRow(license);
    return { record, status: adminStatus(record, today), orgId: license.orgId, orgName, founderNumber: numbers.get(record.payload.id) ?? null };
  });
  const status = filters.status ?? '';
  if (status === 'current') out = out.filter((r) => r.status !== 'replaced' && r.status !== 'refunded' && r.status !== 'revoked' && r.status !== 'test');
  else if (status) out = out.filter((r) => r.status === status);
  return { rows: out.slice(0, LIST_LIMIT), more: out.length > LIST_LIMIT };
}

// ---------------------------------------------------------------------------
// Detail

export type Note = { id: number; body: string; createdAt: Date; author: string | null };
export type HistoryEntry = { id: number; at: Date; action: string; actor: string | null; targetId: string | null; details: Record<string, unknown> };

export type LicenseDetail = {
  record: LicenseRecord;
  status: AdminStatus;
  org: { id: string; name: string; stripeCustomerId: string | null; country: string | null } | null;
  founderNumber: number | null;
  notes: Note[];
  history: HistoryEntry[];
  /** The whole reissue chain, oldest first (this license included). */
  chain: { licenseId: string; issuedAt: string; current: boolean }[];
  order: typeof manualOrders.$inferSelect | null;
};

export async function notesFor(db: Db, targetType: 'license' | 'organization', targetIds: string[]): Promise<Note[]> {
  if (targetIds.length === 0) return [];
  const rows = await db
    .select({ id: adminNotes.id, body: adminNotes.body, createdAt: adminNotes.createdAt, author: users.email })
    .from(adminNotes)
    .leftJoin(users, eq(users.id, adminNotes.authorUserId))
    .where(and(eq(adminNotes.targetType, targetType), inArray(adminNotes.targetId, targetIds)))
    .orderBy(desc(adminNotes.createdAt), desc(adminNotes.id));
  return rows;
}

export async function historyFor(db: Db, targetType: string, targetIds: string[]): Promise<HistoryEntry[]> {
  if (targetIds.length === 0) return [];
  return db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      // The refund webhook writes as "stripe" (not a user).
      actor: sql<string | null>`coalesce(${users.email}, case when ${auditLog.actorUserId} = 'stripe' then 'stripe' end)`,
      targetId: auditLog.targetId,
      details: auditLog.details,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(and(eq(auditLog.targetType, targetType), inArray(auditLog.targetId, targetIds)))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(200);
}

async function chainOf(db: Db, record: LicenseRecord): Promise<LicenseRecord[]> {
  const chain = [record];
  const byId = async (id: string) => {
    const [row] = await db.select().from(licenses).where(eq(licenses.licenseId, id)).limit(1);
    return row ? fromRow(row) : null;
  };
  for (let r = record, i = 0; r.supersedes && i < 50; i++) {
    const prev = await byId(r.supersedes);
    if (!prev) break;
    chain.unshift(prev);
    r = prev;
  }
  for (let r = record, i = 0; r.superseded_by && i < 50; i++) {
    const next = await byId(r.superseded_by);
    if (!next) break;
    chain.push(next);
    r = next;
  }
  return chain;
}

export async function licenseDetail(db: Db, licenseId: string, today: string): Promise<LicenseDetail | null> {
  const [row] = await db.select().from(licenses).where(eq(licenses.licenseId, licenseId)).limit(1);
  if (!row) return null;
  const record = fromRow(row);
  const [org] = row.orgId
    ? await db
        .select({ id: organizations.id, name: organizations.name, stripeCustomerId: organizations.stripeCustomerId, country: organizations.country })
        .from(organizations)
        .where(eq(organizations.id, row.orgId))
        .limit(1)
    : [];
  const chain = await chainOf(db, record);
  const ids = chain.map((c) => c.payload.id);
  const [notes, history, numbers, orders] = await Promise.all([
    notesFor(db, 'license', ids),
    historyFor(db, 'license', ids),
    founderNumbers(db),
    db.select().from(manualOrders).where(eq(manualOrders.licenseId, licenseId)).limit(1),
  ]);
  return {
    record,
    status: adminStatus(record, today),
    org: org ?? null,
    founderNumber: numbers.get(licenseId) ?? null,
    notes,
    history,
    chain: chain.map((c) => ({ licenseId: c.payload.id, issuedAt: c.payload.issued_at, current: !c.superseded_by })),
    order: orders[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Notes

export async function addNote(db: Db, actor: Actor, targetType: 'license' | 'organization', targetId: string, rawBody: string): Promise<void> {
  const body = textBlock(rawBody);
  if (!body) throw new AdminError('Write a note first.');
  await db.transaction(async (tx) => {
    const exists =
      targetType === 'license'
        ? (await tx.select({ id: licenses.licenseId }).from(licenses).where(eq(licenses.licenseId, targetId)).limit(1)).length > 0
        : isUuid(targetId) && (await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, targetId)).limit(1)).length > 0;
    if (!exists) throw new AdminError('Not found.');
    await tx.insert(adminNotes).values({ targetType, targetId, authorUserId: actor.id, body });
    // The note itself stays in admin_notes: the log only says one was added.
    await audit(tx, { actor: actor.id, action: 'admin.note', orgId: targetType === 'organization' ? targetId : null, targetType, targetId, details: { length: body.length } });
  });
}

// ---------------------------------------------------------------------------
// Terms (pack, kind, dates) for manual licenses and reissues

export type LicenseTerms = {
  licensee: string | null;
  product: PackProduct;
  pack: PackSize;
  maxServers: number;
  kind: Period;
  /** Event: first day. Year: the day updates count from (default today). */
  startDay: string | null;
  /** Event: last day. Year: an explicit updates-until (reissue); default start + 12 months. */
  endDay: string | null;
};

export type TermsInput = Record<string, string | undefined>;

/** Checks pack/kind/dates from a form. Returns the terms or a message. */
export function checkTerms(raw: TermsInput, options: { defaultMaxServers: (product: PackProduct, pack: PackSize) => number | null }): LicenseTerms | string {
  const product = raw.product;
  const pack = raw.pack;
  const kind = raw.kind;
  if (!isProduct(product)) return 'Choose a product.';
  if (!isPackSize(pack)) return 'Choose a pack size.';
  if (!isPeriod(kind)) return 'Choose the kind of license.';
  const maxRaw = (raw.maxServers ?? '').trim();
  const maxServers = maxRaw ? Number(maxRaw) : options.defaultMaxServers(product, pack);
  if (!maxServers || !Number.isInteger(maxServers) || maxServers < 1 || maxServers > 10_000) return 'Enter the server limit (a whole number).';
  const start = (raw.startDay ?? '').trim() || null;
  const end = (raw.endDay ?? '').trim() || null;
  if (start && !isDay(start)) return 'The start date must be a date (YYYY-MM-DD).';
  if (end && !isDay(end)) return 'The end date must be a date (YYYY-MM-DD).';
  if (kind === 'event') {
    if (!start || !end) return 'An event license needs the first and last day.';
    if (end < start) return 'The last day is before the first.';
    if (end > addDays(start, EVENT_MAX_DAYS - 1)) return `An event license covers at most ${EVENT_MAX_DAYS} days in a row.`;
  }
  if (kind === 'year' && start && end && end <= start) return 'Updates must end after they start.';
  return { licensee: line(raw.licensee, 200), product, pack, maxServers, kind, startDay: start, endDay: end };
}

/** The payload's date fields for terms, as of `today`. */
export function datesFor(terms: LicenseTerms, today: string): Pick<LicensePayload, 'updates_until' | 'valid_from' | 'valid_to'> {
  if (terms.kind === 'founder') return { updates_until: LIFETIME };
  if (terms.kind === 'year') return { updates_until: terms.endDay ?? addMonths(terms.startDay ?? today, 12) };
  return { updates_until: terms.endDay as string, valid_from: terms.startDay as string, valid_to: terms.endDay as string };
}

async function founderPlaceFree(tx: Tx, now: Date): Promise<boolean> {
  return founderSalesOpen(await createLicenseStore(tx as unknown as Db).founderCount(), now);
}

// ---------------------------------------------------------------------------
// Reissue

export type ReissueInput = {
  terms: LicenseTerms;
  /** A difference paid for it (pack upgrade), minor units. */
  amount: number | null;
  currency: Currency | null;
  paymentRef: string | null;
  reason: string | null;
};

/**
 * Signs a new key for a license with changed terms (corrected dates or
 * licensee, a pack upgrade after the buyer paid the difference) and marks the
 * old one superseded_by it. The new license keeps the email hash, organization,
 * customer and mode; it gets a new id and issued_at. Only the current key of a
 * chain can be reissued, and not a refunded or revoked one.
 */
export async function reissueLicense(db: Db, actor: Actor, licenseId: string, input: ReissueInput, key: SigningKey, now = new Date()): Promise<LicenseRecord> {
  return db.transaction(async (tx) => {
    await lock(tx, `license-admin:${licenseId}`);
    const [row] = await tx.select().from(licenses).where(eq(licenses.licenseId, licenseId)).limit(1);
    if (!row) throw new AdminError('No such license.');
    const old = fromRow(row);
    if (old.superseded_by) throw new AdminError(`This license was already replaced by ${old.superseded_by}. Reissue that one instead.`);
    if (old.revoked_at) throw new AdminError('This license is refunded or revoked; it can’t be reissued.');
    const { terms } = input;
    if (terms.kind === 'founder' && old.payload.kind !== 'founder' && old.livemode) {
      await lock(tx, 'founder-cap');
      if (!(await founderPlaceFree(tx, now))) throw new AdminError('The founding supporter packs are sold out (or past the last day).');
    }
    const today = now.toISOString().slice(0, 10);
    const payload: LicensePayload = {
      v: 1,
      kid: key.kid,
      id: newLicenseId(),
      customer: old.payload.customer,
      // The form starts with the old licensee: an empty field removes it.
      ...(terms.licensee ? { licensee: terms.licensee } : {}),
      product: terms.product,
      pack: terms.pack,
      max_servers: terms.maxServers,
      kind: terms.kind,
      issued_at: `${now.toISOString().slice(0, 19)}Z`,
      ...datesFor(terms, today),
    };
    const paid = input.amount !== null && input.amount > 0 && input.currency !== null;
    const record: LicenseRecord = {
      session_id: `reissue_${randomBytes(12).toString('base64url')}`,
      invoice_number: null,
      email_sha256: old.email_sha256,
      livemode: old.livemode,
      dates_from_form: terms.kind === 'event' ? true : old.dates_from_form,
      payload,
      token: signLicense(payload, key),
      org_id: old.org_id ?? null,
      amount_total: paid ? input.amount : null,
      currency: paid ? input.currency : null,
      paid_at: paid ? now.toISOString() : null,
      source: old.source ?? 'stripe',
      payment_ref: input.paymentRef,
      supersedes: old.payload.id,
    };
    await tx.insert(licenses).values(toRow(record));
    await tx.update(licenses).set({ supersededBy: payload.id }).where(eq(licenses.licenseId, old.payload.id));
    const changed = (['licensee', 'product', 'pack', 'max_servers', 'kind', 'updates_until', 'valid_from', 'valid_to'] as const).filter(
      (k) => old.payload[k] !== payload[k],
    );
    await audit(tx, {
      actor: actor.id,
      action: 'license.reissue',
      orgId: record.org_id ?? null,
      targetType: 'license',
      targetId: old.payload.id,
      details: { new_id: payload.id, changed, ...(paid ? { amount: input.amount, currency: input.currency } : {}), ...(input.reason ? { reason: input.reason } : {}) },
    });
    return record;
  });
}

// ---------------------------------------------------------------------------
// Refund / revoke

export async function revokeLicense(db: Db, actor: Actor, licenseId: string, reason: RevokeReason, note: string | null, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await lock(tx, `license-admin:${licenseId}`);
    const [row] = await tx
      .update(licenses)
      .set({ revokedAt: now, revokeReason: reason })
      .where(and(eq(licenses.licenseId, licenseId), isNull(licenses.revokedAt)))
      .returning({ orgId: licenses.orgId });
    if (!row) throw new AdminError('No such license, or it is already refunded or revoked.');
    await audit(tx, { actor: actor.id, action: reason === 'refunded' ? 'license.refund' : 'license.revoke', orgId: row.orgId, targetType: 'license', targetId: licenseId });
    if (note) {
      await tx.insert(adminNotes).values({ targetType: 'license', targetId: licenseId, authorUserId: actor.id, body: note });
    }
  });
}

// ---------------------------------------------------------------------------
// Manual (bank transfer / invoice) orders

export type ManualOrder = typeof manualOrders.$inferSelect;

export type ManualOrderInput = {
  terms: LicenseTerms & { licensee: string };
  orgId: string | null;
  /** The buyer's email, only to hash (and to send the key right away). Never stored. */
  email: string | null;
  amount: number;
  currency: Currency;
  paymentRef: string | null;
  paid: boolean;
};

async function issueManual(tx: Tx, actor: Actor, order: ManualOrder, key: SigningKey, now: Date): Promise<LicenseRecord> {
  const [org] = order.orgId ? await tx.select({ customer: organizations.stripeCustomerId }).from(organizations).where(eq(organizations.id, order.orgId)).limit(1) : [];
  const terms: LicenseTerms = {
    licensee: order.licensee,
    product: order.product as PackProduct,
    pack: order.pack as PackSize,
    maxServers: order.maxServers,
    kind: order.kind as Period,
    startDay: order.startDay,
    endDay: order.endDay,
  };
  const today = now.toISOString().slice(0, 10);
  const payload: LicensePayload = {
    v: 1,
    kid: key.kid,
    id: newLicenseId(),
    // The Stripe customer when the organization has one; never the buyer's email (kept only as a hash).
    customer: org?.customer ?? (order.orgId ? `org:${order.orgId}` : `manual:${order.id}`),
    licensee: order.licensee,
    product: terms.product,
    pack: terms.pack,
    max_servers: terms.maxServers,
    kind: terms.kind,
    issued_at: `${now.toISOString().slice(0, 19)}Z`,
    ...datesFor(terms, today),
  };
  const record: LicenseRecord = {
    session_id: `manual_${order.id.replace(/-/g, '')}`,
    invoice_number: null,
    email_sha256: order.emailHash,
    livemode: true,
    dates_from_form: terms.kind === 'event',
    payload,
    token: signLicense(payload, key),
    org_id: order.orgId,
    amount_total: order.amountTotal,
    currency: order.currency,
    paid_at: (order.paidAt ?? now).toISOString(),
    source: 'manual' satisfies LicenseSource,
    payment_ref: order.paymentRef,
  };
  await tx.insert(licenses).values(toRow(record));
  await tx.update(manualOrders).set({ licenseId: payload.id }).where(eq(manualOrders.id, order.id));
  await audit(tx, { actor: actor.id, action: 'license.issue', orgId: order.orgId, targetType: 'license', targetId: payload.id, details: { via: 'manual', order: order.id } });
  return record;
}

/**
 * Records a manual order. Paid: the key is issued now. Unpaid: no key yet, but
 * a founder order holds its place under the cap until it is paid or cancelled.
 */
export async function createManualOrder(
  db: Db,
  actor: Actor,
  input: ManualOrderInput,
  key: SigningKey | null,
  now = new Date(),
): Promise<{ order: ManualOrder; record: LicenseRecord | null }> {
  if (input.paid && !key) throw new AdminError('License signing is not set up (LICENSE_SIGNING_KEY), so no key can be issued.');
  if (!isCurrency(input.currency)) throw new AdminError('Choose EUR or NOK.');
  if (!Number.isInteger(input.amount) || input.amount < 0) throw new AdminError('Enter the amount.');
  if (input.orgId !== null && !isUuid(input.orgId)) throw new AdminError('No such organization.');
  return db.transaction(async (tx) => {
    // One founder order at a time, so two can't both take the last place.
    await lock(tx, 'founder-cap');
    if (input.terms.kind === 'founder' && !(await founderPlaceFree(tx, now))) throw new AdminError('The founding supporter packs are sold out (or past the last day).');
    if (input.orgId) {
      const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.orgId)).limit(1);
      if (!org) throw new AdminError('No such organization.');
    }
    const [order] = await tx
      .insert(manualOrders)
      .values({
        status: input.paid ? 'paid' : 'unpaid',
        licensee: input.terms.licensee,
        orgId: input.orgId,
        emailHash: input.email ? emailHash(input.email) : null,
        product: input.terms.product,
        pack: input.terms.pack,
        maxServers: input.terms.maxServers,
        kind: input.terms.kind,
        startDay: input.terms.startDay,
        endDay: input.terms.endDay,
        amountTotal: input.amount,
        currency: input.currency,
        paymentRef: input.paymentRef,
        createdBy: actor.id,
        paidAt: input.paid ? now : null,
      })
      .returning();
    await audit(tx, {
      actor: actor.id,
      action: 'order.create',
      orgId: input.orgId,
      targetType: 'order',
      targetId: order.id,
      details: { paid: input.paid, kind: input.terms.kind, amount: input.amount, currency: input.currency },
    });
    const record = input.paid ? await issueManual(tx, actor, order, key as SigningKey, now) : null;
    return { order: record ? { ...order, licenseId: record.payload.id } : order, record };
  });
}

/** Marks an unpaid manual order paid and issues its key. `email`, when given, must be the buyer's (checked against the hash later, when sending). */
export async function markOrderPaid(db: Db, actor: Actor, orderId: string, input: { paymentRef: string | null; paidOn: string | null }, key: SigningKey, now = new Date()): Promise<LicenseRecord> {
  if (!isUuid(orderId)) throw new AdminError('No such order.');
  return db.transaction(async (tx) => {
    await lock(tx, `order:${orderId}`);
    const paidAt = input.paidOn ? new Date(`${input.paidOn}T12:00:00Z`) : now;
    const [order] = await tx
      .update(manualOrders)
      .set({ status: 'paid', paidAt, ...(input.paymentRef ? { paymentRef: input.paymentRef } : {}) })
      .where(and(eq(manualOrders.id, orderId), eq(manualOrders.status, 'unpaid')))
      .returning();
    if (!order) throw new AdminError('No such unpaid order.');
    await audit(tx, { actor: actor.id, action: 'order.paid', orgId: order.orgId, targetType: 'order', targetId: order.id });
    return issueManual(tx, actor, order, key, now);
  });
}

export async function cancelOrder(db: Db, actor: Actor, orderId: string): Promise<void> {
  if (!isUuid(orderId)) throw new AdminError('No such order.');
  await db.transaction(async (tx) => {
    const [order] = await tx
      .update(manualOrders)
      .set({ status: 'cancelled' })
      .where(and(eq(manualOrders.id, orderId), eq(manualOrders.status, 'unpaid')))
      .returning({ id: manualOrders.id, orgId: manualOrders.orgId });
    if (!order) throw new AdminError('No such unpaid order.');
    await audit(tx, { actor: actor.id, action: 'order.cancel', orgId: order.orgId, targetType: 'order', targetId: order.id });
  });
}

export async function listOrders(db: Db, status: 'unpaid' | 'all' = 'unpaid'): Promise<(ManualOrder & { orgName: string | null })[]> {
  const rows = await db
    .select({ order: manualOrders, orgName: organizations.name })
    .from(manualOrders)
    .leftJoin(organizations, eq(organizations.id, manualOrders.orgId))
    .where(status === 'unpaid' ? eq(manualOrders.status, 'unpaid') : undefined)
    .orderBy(desc(manualOrders.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r.order, orgName: r.orgName }));
}

export async function getOrder(db: Db, orderId: string): Promise<(ManualOrder & { orgName: string | null }) | null> {
  if (!isUuid(orderId)) return null;
  const [row] = await db
    .select({ order: manualOrders, orgName: organizations.name })
    .from(manualOrders)
    .leftJoin(organizations, eq(organizations.id, manualOrders.orgId))
    .where(eq(manualOrders.id, orderId))
    .limit(1);
  return row ? { ...row.order, orgName: row.orgName } : null;
}

/** The license row by id (for resending its email). */
export async function licenseById(db: Db, licenseId: string): Promise<LicenseRecord | null> {
  const [row] = await db.select().from(licenses).where(eq(licenses.licenseId, licenseId)).limit(1);
  return row ? fromRow(row) : null;
}
