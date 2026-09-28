/**
 * License refunds: the money side (a Stripe refund, or a manual one recorded
 * for a bank transfer) and the license side (refunded_amount on the row that
 * holds the payment; a full refund also marks the license refunded, so
 * /verify says "Revoked", the console stops showing it and it leaves revenue
 * and the VAT total).
 *
 * Two ways in:
 * - refundLicense: the admin CRM's Refund button, only once the admin has
 *   confirmed it through the link emailed to them (./refundRequests.ts).
 * - syncChargeRefund / syncRefundFailure: the Stripe webhook (charge.refunded,
 *   refund.updated, refund.failed), so a refund made in the Stripe Dashboard
 *   lands here too, and the admin's own refund is confirmed.
 *
 * Never twice: before a Stripe refund the payment's existing refunds are read
 * from Stripe, the call carries an idempotency key made of the license, the
 * amount and what was already refunded (a double click makes one refund), and
 * the database side is idempotent (amounts only grow, an audit entry per
 * Stripe refund id). Nothing here logs an email address, key or secret.
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { adminNotes, auditLog, licenses, type RevokeReason } from '../db/schema';
import { audit, type Tx } from '../console/audit';
import { CHECKOUT_SESSION_ID } from './format';
import { fromRow, type LicenseRecord } from './store';

export class RefundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefundError';
  }
}

export const REFUND_REASONS = ['requested_by_customer', 'duplicate', 'fraudulent'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];
export const isRefundReason = (v: unknown): v is RefundReason => typeof v === 'string' && (REFUND_REASONS as readonly string[]).includes(v);

/** Who did it: an admin's user id, or 'stripe' for the webhook. */
export type RefundActor = { id: string };
export const STRIPE_ACTOR = 'stripe';

// ---------------------------------------------------------------------------
// The slice of the Stripe client this uses (the real one fits; tests pass a fake)

export type StripeRefundLike = {
  id: string;
  amount: number;
  currency: string;
  status: string | null;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
};

export type RefundClient = {
  checkout: {
    sessions: {
      retrieve(id: string): Promise<{
        id: string;
        payment_intent: string | { id: string } | null;
        amount_total: number | null;
        currency: string | null;
        customer_details?: { email?: string | null } | null;
      }>;
      list(params: { payment_intent: string; limit: number }): Promise<{ data: { id: string }[] }>;
    };
  };
  refunds: {
    list(params: { payment_intent: string; limit: number }): Promise<{ data: StripeRefundLike[]; has_more?: boolean }>;
    create(
      params: { payment_intent: string; amount: number; reason: RefundReason; metadata: Record<string, string> },
      options: { idempotencyKey: string },
    ): Promise<StripeRefundLike>;
  };
};

/** A Stripe error, without importing the SDK: type, code, status and request id (never the message: it can echo part of the key). */
function stripeErrorInfo(err: unknown): { type: string; code?: string; statusCode?: number; requestId?: string } | null {
  const e = err as { type?: unknown; code?: unknown; statusCode?: unknown; requestId?: unknown } | null;
  if (!e || typeof e.type !== 'string' || !e.type.startsWith('Stripe')) return null;
  return {
    type: e.type,
    ...(typeof e.code === 'string' ? { code: e.code } : {}),
    ...(typeof e.statusCode === 'number' ? { statusCode: e.statusCode } : {}),
    ...(typeof e.requestId === 'string' ? { requestId: e.requestId } : {}),
  };
}

/** Runs one Stripe call; a refusal becomes a RefundError the admin can act on. `permission` names what the restricted key needs for it. */
async function stripeStep<T>(permission: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    const info = stripeErrorInfo(err);
    if (!info) throw err;
    console.warn('[refund] stripe call failed', { permission, ...info });
    if (info.type === 'StripePermissionError' || info.statusCode === 403) {
      throw new RefundError(`Stripe refused: the site's Stripe key is missing a permission. Add ${permission} to the restricted key (Stripe Dashboard → Developers → API keys), then try again. Nothing was refunded.`);
    }
    if (info.type === 'StripeIdempotencyError') {
      throw new RefundError('Another refund for this license is being made right now. Reload the page and check before trying again.');
    }
    if (info.code === 'charge_already_refunded') throw new RefundError('Stripe says this payment is already fully refunded. Reload the page: the webhook marks it here.');
    if (info.type === 'StripeAuthenticationError') throw new RefundError('Stripe refused the site’s key (STRIPE_SECRET_KEY). Nothing was refunded.');
    if (info.type === 'StripeConnectionError' || info.type === 'StripeAPIError' || info.type === 'StripeRateLimitError') {
      throw new RefundError('Stripe could not be reached. Nothing was changed here; reload the page and check before trying again.');
    }
    throw new RefundError(`Stripe refused (${info.code ?? info.type}). Nothing was changed here.`);
  }
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === 'string' ? v : (v?.id ?? null));

/** Refunds that took (or are on their way) money back; failed and canceled ones don't count. */
const counts = (r: StripeRefundLike) => r.status !== 'failed' && r.status !== 'canceled';

// ---------------------------------------------------------------------------
// Reading

const lock = (tx: Tx, key: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);

async function byLicenseId(db: Db | Tx, id: string): Promise<LicenseRecord | null> {
  const [row] = await db.select().from(licenses).where(eq(licenses.licenseId, id)).limit(1);
  return row ? fromRow(row) : null;
}

/** The first license of a reissue chain: the one that holds the payment. */
export async function paymentRecord(db: Db | Tx, record: LicenseRecord): Promise<LicenseRecord> {
  let root = record;
  for (let i = 0; root.supersedes && i < 50; i++) {
    const prev = await byLicenseId(db, root.supersedes);
    if (!prev) break;
    root = prev;
  }
  return root;
}

/** Whether the payment of this (root) record was a Stripe card checkout that can be refunded through Stripe. */
export const refundsThroughStripe = (root: LicenseRecord): boolean => (root.source ?? 'stripe') === 'stripe' && CHECKOUT_SESSION_ID.test(root.session_id);

// ---------------------------------------------------------------------------
// Writing (the license side)

/**
 * Marks a whole reissue chain refunded after its payment was fully refunded:
 * every row not yet refunded or revoked. A later row with its own paid amount
 * (a difference paid by bank transfer for a reissue) is marked 'revoked': that
 * money wasn't part of this refund, so it stays in revenue.
 */
async function markChainRefunded(tx: Tx, root: LicenseRecord, now: Date): Promise<string[]> {
  const marked: string[] = [];
  let id: string | null | undefined = root.payload.id;
  for (let i = 0; id && i < 50; i++) {
    const row = await byLicenseId(tx, id);
    if (!row) break;
    if (!row.revoked_at) {
      const reason: RevokeReason = row.payload.id === root.payload.id || !(row.amount_total && row.amount_total > 0) ? 'refunded' : 'revoked';
      await tx
        .update(licenses)
        .set({ revokedAt: now, revokeReason: reason })
        .where(and(eq(licenses.licenseId, row.payload.id), isNull(licenses.revokedAt)));
      marked.push(row.payload.id);
    }
    id = row.superseded_by;
  }
  return marked;
}

/** The current (newest) license of the chain that starts at `root`. */
async function currentOf(tx: Tx, root: LicenseRecord): Promise<LicenseRecord> {
  let r = root;
  for (let i = 0; r.superseded_by && i < 50; i++) {
    const next = await byLicenseId(tx, r.superseded_by);
    if (!next) break;
    r = next;
  }
  return r;
}

async function auditedRefund(tx: Tx, refundId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(sql`${auditLog.action} like 'license.refund%'`, sql`${auditLog.details}->>'refund' = ${refundId}`))
    .limit(1);
  return Boolean(row);
}

type Applied = { refundedAmount: number; full: boolean; marked: string[] };

/**
 * Records that the payment of `root` has `total` refunded so far (minor units;
 * only ever grows) and, when that is all of it, marks the chain refunded.
 */
async function applyRefundTotal(tx: Tx, root: LicenseRecord, total: number, charged: number, now: Date, paymentIntent: string | null): Promise<Applied> {
  const [row] = await tx
    .update(licenses)
    .set({
      refundedAmount: sql`greatest(coalesce(${licenses.refundedAmount}, 0), ${total})`,
      refundedAt: now,
      ...(paymentIntent ? { paymentIntent } : {}),
    })
    .where(eq(licenses.licenseId, root.payload.id))
    .returning({ refundedAmount: licenses.refundedAmount });
  const refundedAmount = row?.refundedAmount ?? total;
  const full = charged > 0 && refundedAmount >= charged;
  const marked = full ? await markChainRefunded(tx, root, now) : [];
  return { refundedAmount, full, marked };
}

// ---------------------------------------------------------------------------
// The admin's Refund button

export type RefundInput = {
  /** Minor units of the license's currency; null: everything not refunded yet. */
  amount: number | null;
  reason: RefundReason;
  note: string | null;
  /** A license without a Stripe payment (bank transfer): when and how the money went back. */
  manual?: { refundedOn: Date | null; reference: string | null };
};

export type RefundOutcome = {
  licenseId: string;
  /** The license that holds the payment (the first of a reissue chain). */
  paymentLicenseId: string;
  amount: number;
  currency: string;
  /** All of the payment is refunded now (the license is marked refunded). */
  full: boolean;
  via: 'stripe' | 'manual';
  stripeRefundId: string | null;
  /** Stripe's refund status ('succeeded', 'pending', …), or 'recorded' for a manual one. */
  status: string;
  /** The address the checkout was paid with, from Stripe, for the optional email. Never stored or logged. */
  buyerEmail: string | null;
  /** The license record after the refund (for the email). */
  record: LicenseRecord;
};

/** What the Refund form offers: the payment's amount, what is left to refund, and how. */
export async function refundable(db: Db, licenseId: string): Promise<{ root: LicenseRecord; charged: number | null; refunded: number; left: number | null; via: 'stripe' | 'manual' } | null> {
  const record = await byLicenseId(db, licenseId);
  if (!record) return null;
  const root = await paymentRecord(db, record);
  const charged = root.amount_total ?? null;
  const refunded = root.refunded_amount ?? 0;
  return { root, charged, refunded, left: charged === null ? null : Math.max(0, charged - refunded), via: refundsThroughStripe(root) ? 'stripe' : 'manual' };
}

/**
 * Refunds a license's payment and records it. The caller has checked that the
 * user is an admin. Stripe: the Checkout Session's PaymentIntent is refunded
 * (needs Checkout Sessions: Read and Refunds: Write on the key). Manual: only
 * recorded. Throws RefundError with a message for the admin.
 */
export async function refundLicense(
  db: Db,
  actor: RefundActor,
  licenseId: string,
  input: RefundInput,
  deps: { stripe: RefundClient | null; now?: Date },
): Promise<RefundOutcome> {
  const now = deps.now ?? new Date();
  const record = await byLicenseId(db, licenseId);
  if (!record) throw new RefundError('No such license.');
  if (record.superseded_by) throw new RefundError(`This license was replaced by ${record.superseded_by}. Refund from that one.`);
  if (record.revoked_at) throw new RefundError(record.revoke_reason === 'refunded' ? 'This license is already refunded.' : 'This license is revoked. Refund the payment in Stripe or the bank; the webhook records a Stripe refund.');
  if (input.amount !== null && (!Number.isInteger(input.amount) || input.amount <= 0)) throw new RefundError('Enter an amount above 0, or leave it empty for a full refund.');
  const root = await paymentRecord(db, record);

  if (!refundsThroughStripe(root)) return refundManual(db, actor, record, root, input, now);

  const stripe = deps.stripe;
  if (!stripe) throw new RefundError('Stripe is not set up here (STRIPE_SECRET_KEY), so nothing can be refunded through it.');
  const session = await stripeStep('Checkout Sessions: Read', () => stripe.checkout.sessions.retrieve(root.session_id));
  const paymentIntent = idOf(session.payment_intent);
  const charged = session.amount_total ?? 0;
  const currency = (session.currency ?? root.currency ?? 'eur').toLowerCase();
  if (!paymentIntent || charged <= 0) throw new RefundError('This checkout has no card payment to refund (a free or fully discounted order).');

  // What Stripe already gave back for this payment (a refund made in the Dashboard counts too).
  const existing = await stripeStep('Refunds: Read (part of Refunds: Write)', () => stripe.refunds.list({ payment_intent: paymentIntent, limit: 100 }));
  const already = existing.data.filter(counts).reduce((sum, r) => sum + r.amount, 0);
  const left = charged - already;
  if (left <= 0) {
    // Refunded in Stripe already, but not marked here yet (the webhook hasn't come): catch up, don't refund.
    await db.transaction(async (tx) => {
      await lock(tx, `license-refund:${root.payload.id}`);
      await applyRefundTotal(tx, root, already, charged, now, paymentIntent);
    });
    throw new RefundError('Stripe says this payment is already fully refunded. It is now marked refunded here; nothing more was refunded.');
  }
  const amount = input.amount ?? left;
  if (amount > left) throw new RefundError(`At most ${(left / 100).toFixed(2)} ${currency.toUpperCase()} is left to refund.`);

  const refund = await stripeStep('Refunds: Write', () =>
    stripe.refunds.create(
      {
        payment_intent: paymentIntent,
        amount,
        reason: input.reason,
        metadata: { license_id: record.payload.id, payment_license_id: root.payload.id, actor: actor.id },
      },
      // Same license, amount and state before: the same refund (a double click, a retried request).
      { idempotencyKey: `refund:${record.payload.id}:${amount}:${already}` },
    ),
  );
  if (refund.status === 'failed' || refund.status === 'canceled') {
    throw new RefundError(`Stripe could not make the refund (status ${refund.status}). Nothing was changed here; check the payment in Stripe.`);
  }

  const applied = await db.transaction(async (tx) => {
    await lock(tx, `license-refund:${root.payload.id}`);
    const applied = await applyRefundTotal(tx, root, already + refund.amount, charged, now, paymentIntent);
    // A double click gets the same refund back from Stripe: log it once.
    if (!(await auditedRefund(tx, refund.id))) {
      await audit(tx, {
        actor: actor.id,
        action: applied.full ? 'license.refund' : 'license.refund_partial',
        orgId: record.org_id ?? null,
        targetType: 'license',
        targetId: record.payload.id,
        details: {
          via: 'stripe',
          refund: refund.id,
          status: refund.status,
          amount: refund.amount,
          currency,
          reason: input.reason,
          refunded_total: applied.refundedAmount,
          ...(root.payload.id !== record.payload.id ? { payment_license: root.payload.id } : {}),
          ...(applied.marked.length > 0 ? { marked: applied.marked } : {}),
        },
      });
      if (input.note) await tx.insert(adminNotes).values({ targetType: 'license', targetId: record.payload.id, authorUserId: actor.id, body: input.note });
    }
    return applied;
  });
  console.info('[refund] refunded', { id: record.payload.id, refund: refund.id, amount: refund.amount, full: applied.full, status: refund.status });
  return {
    licenseId: record.payload.id,
    paymentLicenseId: root.payload.id,
    amount: refund.amount,
    currency,
    full: applied.full,
    via: 'stripe',
    stripeRefundId: refund.id,
    status: refund.status ?? 'pending',
    buyerEmail: session.customer_details?.email?.trim().toLowerCase() ?? null,
    record: (await byLicenseId(db, record.payload.id)) ?? record,
  };
}

async function refundManual(db: Db, actor: RefundActor, record: LicenseRecord, root: LicenseRecord, input: RefundInput, now: Date): Promise<RefundOutcome> {
  const charged = root.amount_total ?? 0;
  const currency = (root.currency ?? 'eur').toLowerCase();
  const refundedOn = input.manual?.refundedOn ?? now;
  return db.transaction(async (tx) => {
    await lock(tx, `license-refund:${root.payload.id}`);
    // Read again under the lock: two clicks can't both record the last part.
    const fresh = (await byLicenseId(tx, root.payload.id)) ?? root;
    const left = charged - (fresh.refunded_amount ?? 0);
    if (charged <= 0 || left <= 0) throw new RefundError(charged <= 0 ? 'No amount was recorded for this license, so there is nothing to refund. Use "Refund or revoke" to mark it.' : 'This payment is already fully refunded.');
    const amount = input.amount ?? left;
    if (amount > left) throw new RefundError(`At most ${(left / 100).toFixed(2)} ${currency.toUpperCase()} is left to refund.`);
    const applied = await applyRefundTotal(tx, fresh, (fresh.refunded_amount ?? 0) + amount, charged, refundedOn, null);
    await audit(tx, {
      actor: actor.id,
      action: applied.full ? 'license.refund' : 'license.refund_partial',
      orgId: record.org_id ?? null,
      targetType: 'license',
      targetId: record.payload.id,
      details: {
        via: 'manual',
        amount,
        currency,
        reason: input.reason,
        refunded_on: refundedOn.toISOString().slice(0, 10),
        ...(input.manual?.reference ? { reference: input.manual.reference } : {}),
        refunded_total: applied.refundedAmount,
        ...(root.payload.id !== record.payload.id ? { payment_license: root.payload.id } : {}),
        ...(applied.marked.length > 0 ? { marked: applied.marked } : {}),
      },
    });
    if (input.note) await tx.insert(adminNotes).values({ targetType: 'license', targetId: record.payload.id, authorUserId: actor.id, body: input.note });
    return {
      licenseId: record.payload.id,
      paymentLicenseId: root.payload.id,
      amount,
      currency,
      full: applied.full,
      via: 'manual' as const,
      stripeRefundId: null,
      status: 'recorded',
      buyerEmail: null,
      record: (await byLicenseId(tx, record.payload.id)) ?? record,
    };
  });
}

// ---------------------------------------------------------------------------
// The webhook

export type ChargeLike = {
  id: string;
  amount: number;
  amount_refunded: number;
  refunded: boolean;
  currency: string;
  payment_intent: string | { id: string } | null;
};

export type SyncResult = { status: 'unknown' } | { status: 'unchanged' | 'partial' | 'refunded'; licenseId: string; refundedAmount: number };

/**
 * The license paid by this PaymentIntent: by the stored payment_intent, or
 * (licenses issued before it was stored) through the Checkout Session that
 * `findSession` finds for it in Stripe.
 */
export async function licenseForPaymentIntent(db: Db, paymentIntent: string, findSession: (pi: string) => Promise<string | null>): Promise<LicenseRecord | null> {
  const [row] = await db.select().from(licenses).where(eq(licenses.paymentIntent, paymentIntent)).limit(1);
  if (row) return fromRow(row);
  const sessionId = await findSession(paymentIntent);
  if (!sessionId) return null;
  const [bySession] = await db.select().from(licenses).where(eq(licenses.sessionId, sessionId)).limit(1);
  return bySession ? fromRow(bySession) : null;
}

/**
 * charge.refunded: brings the license in line with the charge. amount_refunded
 * is the charge's running total, so a redelivered or out-of-order event
 * changes nothing (amounts only grow here). Fully refunded (charge.refunded):
 * the chain is marked refunded. Partial: the amount is recorded, the license
 * stays valid. The audit entry's actor is "stripe".
 */
export async function syncChargeRefund(db: Db, charge: ChargeLike, findSession: (pi: string) => Promise<string | null>, now = new Date()): Promise<SyncResult> {
  const paymentIntent = idOf(charge.payment_intent);
  if (!paymentIntent) return { status: 'unknown' };
  const found = await licenseForPaymentIntent(db, paymentIntent, findSession);
  if (!found) return { status: 'unknown' };
  return db.transaction(async (tx) => {
    const root = await paymentRecord(tx, found);
    await lock(tx, `license-refund:${root.payload.id}`);
    const fresh = (await byLicenseId(tx, root.payload.id)) ?? root;
    const before = fresh.refunded_amount ?? 0;
    const wasRefunded = Boolean(fresh.revoked_at) && fresh.revoke_reason === 'refunded';
    // charge.refunded is Stripe's "fully refunded"; then amount_refunded equals amount.
    const applied = await applyRefundTotal(tx, fresh, charge.amount_refunded, charge.amount, now, paymentIntent);
    const current = await currentOf(tx, fresh);
    const changed = applied.refundedAmount !== before || applied.marked.length > 0;
    if (changed) {
      await audit(tx, {
        actor: STRIPE_ACTOR,
        action: applied.full && !wasRefunded ? 'license.refund' : 'license.refund_partial',
        orgId: current.org_id ?? null,
        targetType: 'license',
        targetId: current.payload.id,
        details: {
          via: 'stripe-webhook',
          charge: charge.id,
          amount: Math.max(0, applied.refundedAmount - before),
          currency: charge.currency,
          refunded_total: applied.refundedAmount,
          ...(fresh.payload.id !== current.payload.id ? { payment_license: fresh.payload.id } : {}),
          ...(applied.marked.length > 0 ? { marked: applied.marked } : {}),
        },
      });
    }
    return { status: !changed ? 'unchanged' : applied.full ? 'refunded' : 'partial', licenseId: current.payload.id, refundedAmount: applied.refundedAmount };
  });
}

/**
 * refund.updated / refund.failed with status failed or canceled: the money
 * stayed with us. Takes the amount off refunded_amount (once per refund id).
 * A license marked refunded because of it stays off (the key isn't switched
 * back on by a webhook) but is changed to "revoked", so the payment counts as
 * revenue again, and a note says what happened.
 */
export async function syncRefundFailure(db: Db, refund: StripeRefundLike, findSession: (pi: string) => Promise<string | null>, now = new Date()): Promise<SyncResult> {
  if (refund.status !== 'failed' && refund.status !== 'canceled') return { status: 'unknown' };
  const paymentIntent = idOf(refund.payment_intent);
  const byMeta = refund.metadata?.payment_license_id ?? refund.metadata?.license_id;
  const found = (byMeta ? await byLicenseId(db, byMeta) : null) ?? (paymentIntent ? await licenseForPaymentIntent(db, paymentIntent, findSession) : null);
  if (!found) return { status: 'unknown' };
  return db.transaction(async (tx) => {
    const root = await paymentRecord(tx, found);
    await lock(tx, `license-refund:${root.payload.id}`);
    const [done] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'license.refund_failed'), sql`${auditLog.details}->>'refund' = ${refund.id}`))
      .limit(1);
    const current = await currentOf(tx, root);
    const fresh = (await byLicenseId(tx, root.payload.id)) ?? root;
    if (done) return { status: 'unchanged' as const, licenseId: current.payload.id, refundedAmount: fresh.refunded_amount ?? 0 };
    const refundedAmount = Math.max(0, (fresh.refunded_amount ?? 0) - refund.amount);
    await tx.update(licenses).set({ refundedAmount: refundedAmount || null }).where(eq(licenses.licenseId, root.payload.id));
    const charged = fresh.amount_total ?? 0;
    const reverted: string[] = [];
    if (refundedAmount < charged) {
      // Marked refunded, but the money wasn't given back: keep the key off, count the payment again.
      let id: string | null | undefined = root.payload.id;
      for (let i = 0; id && i < 50; i++) {
        const row = await byLicenseId(tx, id);
        if (!row) break;
        if (row.revoke_reason === 'refunded') {
          await tx.update(licenses).set({ revokeReason: 'revoked' }).where(eq(licenses.licenseId, row.payload.id));
          reverted.push(row.payload.id);
        }
        id = row.superseded_by;
      }
    }
    await audit(tx, {
      actor: STRIPE_ACTOR,
      action: 'license.refund_failed',
      orgId: current.org_id ?? null,
      targetType: 'license',
      targetId: current.payload.id,
      details: { refund: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency, refunded_total: refundedAmount, ...(reverted.length > 0 ? { now_revoked: reverted } : {}) },
    });
    await tx.insert(adminNotes).values({
      targetType: 'license',
      targetId: current.payload.id,
      authorUserId: null,
      body: `Stripe refund ${refund.id} ${refund.status} (${(refund.amount / 100).toFixed(2)} ${refund.currency.toUpperCase()}): the money was not given back.${
        reverted.length > 0 ? ' The license stays off, now as "revoked" (the payment counts as revenue again). Refund again in Stripe, or reissue if the buyer keeps it.' : ''
      }`,
    });
    return { status: 'partial' as const, licenseId: current.payload.id, refundedAmount };
  });
}
