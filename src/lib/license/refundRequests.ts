/**
 * Refunds confirmed by email. The admin CRM's Refund button doesn't refund:
 * it creates a pending request here and emails the signed-in admin's own
 * verified address a single-use link. The refund runs (refundLicense, with its
 * checks, idempotency key and Stripe call) only when that same admin opens the
 * link and presses Confirm on the page it leads to (a POST: mail scanners that
 * open links can't trigger it).
 *
 * - The link's token is 32 random bytes; only its SHA-256 is stored, and the
 *   hash is compared timing-safe. Single use, 15 minutes.
 * - One pending request per license (a partial unique index): a new one
 *   cancels the older one.
 * - Confirming claims the request first (pending → confirming, in one UPDATE),
 *   so two confirms make one refund. A refund that fails (Stripe refused, the
 *   license changed) puts it back to pending while it is still valid.
 * - Anyone holding the link can cancel (that is the admin's inbox), and can
 *   sign that admin out everywhere at the same time.
 *
 * Nothing here logs a token or an email address. Relative imports on purpose:
 * the tests run these against PGlite.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { licenses, refundRequests, sessions, users, type RefundRequestStatus } from '../db/schema';
import { audit } from '../console/audit';
import { refundable, refundLicense, RefundError, type RefundClient, type RefundOutcome, type RefundReason } from './refund';
import { fromRow, type LicenseRecord } from './store';

export const REFUND_REQUEST_TTL_MS = 15 * 60_000;
/** Without email (POSTMARK_SERVER_TOKEN) there is no confirmation, so no refunds: never a fallback. */
export const REFUNDS_NEED_EMAIL = 'Refunds need email confirmation; email isn’t set up here (POSTMARK_SERVER_TOKEN), so nothing can be refunded.';
/** base64url of 32 bytes. */
export const REFUND_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export type RefundRequestRow = typeof refundRequests.$inferSelect;

export type RefundRequestInput = {
  /** Minor units; null: everything not refunded yet (resolved now, so the email names the amount). */
  amount: number | null;
  reason: RefundReason;
  note: string | null;
  notifyBuyer: boolean;
  sendTo: string | null;
  manual?: { refundedOn: string | null; reference: string | null };
};

export type CreatedRequest = {
  request: RefundRequestRow;
  /** The link token: goes into the email only. */
  token: string;
  record: LicenseRecord;
  via: 'stripe' | 'manual';
  /** Older pending requests for the license that this one replaced. */
  cancelled: string[];
};

async function licenseRecord(db: Db, id: string): Promise<LicenseRecord | null> {
  const [row] = await db.select().from(licenses).where(eq(licenses.licenseId, id)).limit(1);
  return row ? fromRow(row) : null;
}

/** The same refusals as refundLicense, asked before any email goes out. */
function refusal(record: LicenseRecord | null): string | null {
  if (!record) return 'No such license.';
  if (record.superseded_by) return `This license was replaced by ${record.superseded_by}. Refund from that one.`;
  if (record.revoked_at) return record.revoke_reason === 'refunded' ? 'This license is already refunded.' : 'This license is revoked. Refund the payment in Stripe or the bank; the webhook records a Stripe refund.';
  return null;
}

/**
 * Creates a pending refund request for `licenseId`, asked by `admin`, and
 * returns the token for the email. Cancels any older pending request for the
 * license. Throws RefundError with a message for the admin.
 */
export async function createRefundRequest(db: Db, admin: { id: string }, licenseId: string, input: RefundRequestInput, now = new Date()): Promise<CreatedRequest> {
  const record = await licenseRecord(db, licenseId);
  const refused = refusal(record);
  if (refused || !record) throw new RefundError(refused ?? 'No such license.');
  if (input.amount !== null && (!Number.isInteger(input.amount) || input.amount <= 0)) throw new RefundError('Enter an amount above 0, or leave it empty for a full refund.');
  const payment = await refundable(db, licenseId);
  if (!payment) throw new RefundError('No such license.');
  const currency = (payment.root.currency ?? 'eur').toLowerCase();
  if (payment.left === 0) throw new RefundError('This payment is already fully refunded.');
  const amount = input.amount ?? payment.left;
  if (amount === null) throw new RefundError('The amount paid isn’t known here: enter the amount to refund.');
  if (payment.left !== null && amount > payment.left) throw new RefundError(`At most ${(payment.left / 100).toFixed(2)} ${currency.toUpperCase()} is left to refund.`);

  const token = randomBytes(32).toString('base64url');
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`refund-request:${licenseId}`}, 0))`);
    // A confirm that never finished (the process died mid-refund) doesn't block the license for good:
    // past its expiry plus a grace it is closed. Stripe's own refund list still guards the money.
    await tx
      .update(refundRequests)
      .set({ status: 'expired', sendTo: null })
      .where(and(eq(refundRequests.licenseId, licenseId), eq(refundRequests.status, 'confirming'), lt(refundRequests.expiresAt, new Date(now.getTime() - 2 * 60_000))));
    const [running] = await tx
      .select({ id: refundRequests.id })
      .from(refundRequests)
      .where(and(eq(refundRequests.licenseId, licenseId), eq(refundRequests.status, 'confirming')))
      .limit(1);
    if (running) throw new RefundError('A refund for this license is being confirmed right now. Reload the page in a moment.');
    const cancelled = await tx
      .update(refundRequests)
      .set({ status: 'cancelled', cancelledAt: now, sendTo: null })
      .where(and(eq(refundRequests.licenseId, licenseId), eq(refundRequests.status, 'pending')))
      .returning({ id: refundRequests.id });
    const [request] = await tx
      .insert(refundRequests)
      .values({
        licenseId,
        adminUserId: admin.id,
        amount,
        currency,
        reason: input.reason,
        note: input.note,
        notifyBuyer: input.notifyBuyer,
        sendTo: input.notifyBuyer ? input.sendTo : null,
        refundedOn: input.manual?.refundedOn ?? null,
        reference: input.manual?.reference ?? null,
        tokenHash: sha256(token),
        status: 'pending',
        createdAt: now,
        expiresAt: new Date(now.getTime() + REFUND_REQUEST_TTL_MS),
      })
      .returning();
    await audit(tx, {
      actor: admin.id,
      action: 'license.refund_request',
      orgId: record.org_id ?? null,
      targetType: 'license',
      targetId: licenseId,
      details: {
        request: request.id,
        amount,
        currency,
        reason: input.reason,
        via: payment.via,
        notify_buyer: input.notifyBuyer,
        ...(cancelled.length > 0 ? { replaced: cancelled.map((c) => c.id) } : {}),
      },
    });
    return { request, cancelled: cancelled.map((c) => c.id) };
  });
  return { ...result, token, record, via: payment.via };
}

/** Cancels a request whose confirmation email couldn't be sent (nothing to confirm with). */
export async function withdrawRefundRequest(db: Db, requestId: string, now = new Date()): Promise<void> {
  await db
    .update(refundRequests)
    .set({ status: 'cancelled', cancelledAt: now, sendTo: null })
    .where(and(eq(refundRequests.id, requestId), eq(refundRequests.status, 'pending')));
}

/** A request's status as it stands: a pending one past its expiry reads as expired. */
export const effectiveStatus = (r: Pick<RefundRequestRow, 'status' | 'expiresAt'>, now = new Date()): RefundRequestStatus =>
  r.status === 'pending' && r.expiresAt.getTime() <= now.getTime() ? 'expired' : r.status;

/** The request a link token belongs to, or null (a malformed or unknown token). */
export async function requestByToken(db: Db, token: string): Promise<RefundRequestRow | null> {
  if (!REFUND_TOKEN.test(token)) return null;
  const hash = sha256(token);
  const [row] = await db.select().from(refundRequests).where(eq(refundRequests.tokenHash, hash)).limit(1);
  if (!row) return null;
  const a = Buffer.from(row.tokenHash, 'utf8');
  const b = Buffer.from(hash, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b) ? row : null;
}

/** The pending (not yet expired) requests for a license, newest first, with who asked: the license page lists them. */
export async function pendingRequests(db: Db, licenseId: string, now = new Date()): Promise<(RefundRequestRow & { askedBy: string | null })[]> {
  const rows = await db
    .select({ r: refundRequests, askedBy: users.email })
    .from(refundRequests)
    .leftJoin(users, eq(users.id, refundRequests.adminUserId))
    .where(and(eq(refundRequests.licenseId, licenseId), inArray(refundRequests.status, ['pending', 'confirming']), gt(refundRequests.expiresAt, now)))
    .orderBy(desc(refundRequests.createdAt));
  return rows.map(({ r, askedBy }) => ({ ...r, askedBy }));
}

export type CancelBy = { token: string; signOutEverywhere?: boolean } | { id: string; admin: { id: string } };

/**
 * Cancels a pending request: from the email's link (the token; optionally
 * signing the admin who asked out of every session), or from the license
 * page by an admin. Returns what happened.
 */
export async function cancelRefundRequest(db: Db, by: CancelBy, now = new Date()): Promise<{ cancelled: boolean; signedOut: number; request: RefundRequestRow | null }> {
  const row = 'token' in by ? await requestByToken(db, by.token) : ((await db.select().from(refundRequests).where(eq(refundRequests.id, by.id)).limit(1))[0] ?? null);
  if (!row) return { cancelled: false, signedOut: 0, request: null };
  return db.transaction(async (tx) => {
    const [done] = await tx
      .update(refundRequests)
      .set({ status: 'cancelled', cancelledAt: now, sendTo: null })
      .where(and(eq(refundRequests.id, row.id), eq(refundRequests.status, 'pending')))
      .returning({ id: refundRequests.id });
    let signedOut = 0;
    if ('token' in by && by.signOutEverywhere) {
      signedOut = (await tx.delete(sessions).where(eq(sessions.userId, row.adminUserId)).returning({ x: sessions.userId })).length;
    }
    if (done || signedOut > 0) {
      await audit(tx, {
        actor: 'token' in by ? null : by.admin.id,
        action: 'license.refund_request_cancel',
        targetType: 'license',
        targetId: row.licenseId,
        details: { request: row.id, via: 'token' in by ? 'email-link' : 'console', ...(done ? {} : { already: effectiveStatus(row, now) }), ...('token' in by && by.signOutEverywhere ? { signed_out_sessions: signedOut, user: row.adminUserId } : {}) },
      });
    }
    return { cancelled: Boolean(done), signedOut, request: row };
  });
}

const statusRefusal: Record<Exclude<RefundRequestStatus, 'pending'>, string> = {
  confirming: 'This refund is being made right now. Reload the license page in a moment.',
  confirmed: 'This refund was already confirmed. Nothing more was refunded.',
  cancelled: 'This refund request was cancelled. Nothing was refunded.',
  expired: 'This confirmation link has expired. Nothing was refunded; ask for the refund again.',
};

export type Confirmed = { outcome: RefundOutcome; request: RefundRequestRow };

/**
 * Confirms a request and makes the refund. `user` is the signed-in admin (the
 * caller checked they are an admin right now); they must be the admin who
 * asked. Throws RefundError with a message for the admin.
 */
export async function confirmRefundRequest(db: Db, user: { id: string }, token: string, deps: { stripe: RefundClient | null; now?: Date }): Promise<Confirmed> {
  const now = deps.now ?? new Date();
  const row = await requestByToken(db, token);
  if (!row) throw new RefundError('This confirmation link isn’t valid. Nothing was refunded.');
  if (row.adminUserId !== user.id) {
    await audit(db, {
      actor: user.id,
      action: 'license.refund_confirm_refused',
      targetType: 'license',
      targetId: row.licenseId,
      details: { request: row.id, why: 'another admin' },
    });
    throw new RefundError('Only the admin who asked for this refund can confirm it. Sign in as them, or ask for the refund yourself.');
  }
  const status = effectiveStatus(row, now);
  if (status !== 'pending') throw new RefundError(statusRefusal[status]);

  // Claim it: of two confirms, one gets the row.
  const [claimed] = await db
    .update(refundRequests)
    .set({ status: 'confirming' })
    .where(and(eq(refundRequests.id, row.id), eq(refundRequests.status, 'pending'), eq(refundRequests.adminUserId, user.id), gt(refundRequests.expiresAt, now)))
    .returning();
  if (!claimed) {
    const [fresh] = await db.select().from(refundRequests).where(eq(refundRequests.id, row.id)).limit(1);
    const s = fresh ? effectiveStatus(fresh, now) : 'cancelled';
    throw new RefundError(statusRefusal[s === 'pending' ? 'confirming' : s]);
  }

  const release = () =>
    db
      .update(refundRequests)
      .set({ status: 'pending' })
      .where(and(eq(refundRequests.id, row.id), eq(refundRequests.status, 'confirming')));

  let outcome: RefundOutcome;
  try {
    const payment = await refundable(db, claimed.licenseId);
    if (payment && (payment.root.currency ?? 'eur').toLowerCase() !== claimed.currency) throw new RefundError('The payment’s currency changed since the refund was asked for. Nothing was refunded; ask again.');
    if (payment && payment.left !== null && claimed.amount > payment.left) {
      throw new RefundError(`Only ${(payment.left / 100).toFixed(2)} ${claimed.currency.toUpperCase()} is left to refund now. Nothing was refunded; ask again.`);
    }
    outcome = await refundLicense(
      db,
      user,
      claimed.licenseId,
      {
        amount: claimed.amount,
        reason: claimed.reason as RefundReason,
        note: claimed.note,
        manual: { refundedOn: claimed.refundedOn ? new Date(`${claimed.refundedOn}T12:00:00Z`) : null, reference: claimed.reference },
      },
      { stripe: deps.stripe, now },
    );
  } catch (err) {
    await release().catch(() => {});
    throw err;
  }

  const [request] = await db.transaction(async (tx) => {
    const updated = await tx
      .update(refundRequests)
      .set({ status: 'confirmed', confirmedAt: now, stripeRefundId: outcome.stripeRefundId, sendTo: null })
      .where(eq(refundRequests.id, row.id))
      .returning();
    await audit(tx, {
      actor: user.id,
      action: 'license.refund_request_confirm',
      orgId: outcome.record.org_id ?? null,
      targetType: 'license',
      targetId: claimed.licenseId,
      details: { request: row.id, via: outcome.via, amount: outcome.amount, currency: outcome.currency, ...(outcome.stripeRefundId ? { stripe_refund: outcome.stripeRefundId } : {}) },
    });
    return updated;
  });
  // The buyer email's address (typed in the form) is cleared above; hand it to the caller once.
  return { outcome, request: { ...request, sendTo: claimed.sendTo } };
}
