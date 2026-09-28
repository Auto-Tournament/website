import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb } from '../db/testing';
import { adminNotes, auditLog, licenses, organizations, users } from '../db/schema';
import { licensesForOrg, unassignedLicenses } from '../console/orgs';
import { checkVatThreshold } from '../vat/threshold';
import { resetRateCache } from '../vat/rate';
import { emailHash, type LicensePayload } from './format';
import { refundEmail } from './email';
import { salesBetween, totals } from './sales';
import { createLicenseStore, toRow, type LicenseRecord } from './store';
import { publicCheck } from './verify';
import { refundLicense, RefundError, syncChargeRefund, syncRefundFailure, type RefundClient, type StripeRefundLike } from './refund';

// Refunds against a real (in-memory) Postgres and a fake Stripe client: nothing
// here talks to Stripe.

let t: Awaited<ReturnType<typeof testDb>>;
let admin: { id: string };

const now = new Date('2026-09-28T10:00:00Z');
const today = '2026-09-28';

beforeEach(async () => {
  t = await testDb();
  const [u] = await t.db.insert(users).values({ email: 'admin@example.com', emailVerified: new Date(), isAdmin: true }).returning();
  admin = { id: u.id };
  resetRateCache();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await t.close();
});

function stripeLicense(n: number, over: Partial<LicenseRecord> = {}, payload: Partial<LicensePayload> = {}): LicenseRecord {
  return {
    session_id: `cs_live_refundSession${n}`,
    invoice_number: null,
    email_sha256: emailHash(`buyer${n}@example.com`),
    livemode: true,
    dates_from_form: false,
    token: `ATL1.refund${n}.sig`,
    amount_total: 5900,
    currency: 'eur',
    paid_at: '2026-09-20T10:00:00.000Z',
    payment_intent: `pi_refund${n}`,
    payload: {
      v: 1,
      kid: 'kid',
      id: `L-refundLicense${n}`,
      customer: 'cus_REFUNDCUSTOMER',
      licensee: `Buyer ${n}`,
      product: 'servers',
      pack: 'M',
      max_servers: 20,
      kind: 'year',
      issued_at: '2026-09-20T10:00:00Z',
      updates_until: '2027-09-20',
      ...payload,
    },
    ...over,
  };
}
const insert = (r: LicenseRecord) => t.db.insert(licenses).values(toRow(r));
const row = async (id: string) => (await createLicenseStore(t.db).byLicenseId(id)) as LicenseRecord;
const audits = (action?: string) => t.db.select().from(auditLog).where(action ? eq(auditLog.action, action) : undefined);

/** A fake Stripe: sessions by id, refunds per PaymentIntent, idempotency keys honoured like Stripe's. */
function fakeStripe(sessions: Record<string, { payment_intent: string | null; amount_total: number; email?: string }>) {
  const refunds: (StripeRefundLike & { payment_intent: string })[] = [];
  const keys = new Map<string, { params: string; refund: StripeRefundLike }>();
  const calls = { retrieve: 0, list: 0, create: 0 };
  const client: RefundClient = {
    checkout: {
      sessions: {
        async retrieve(id) {
          calls.retrieve++;
          const s = sessions[id];
          if (!s) throw Object.assign(new Error('No such checkout session'), { type: 'StripeInvalidRequestError', code: 'resource_missing', statusCode: 404 });
          return { id, payment_intent: s.payment_intent, amount_total: s.amount_total, currency: 'eur', customer_details: { email: s.email ?? null } };
        },
        async list({ payment_intent }) {
          const id = Object.keys(sessions).find((k) => sessions[k].payment_intent === payment_intent);
          return { data: id ? [{ id }] : [] };
        },
      },
    },
    refunds: {
      async list({ payment_intent }) {
        calls.list++;
        return { data: refunds.filter((r) => r.payment_intent === payment_intent) };
      },
      async create(params, { idempotencyKey }) {
        const seen = keys.get(idempotencyKey);
        if (seen) {
          if (seen.params !== JSON.stringify(params)) throw Object.assign(new Error('Keys for idempotent requests can only be used with the same parameters'), { type: 'StripeIdempotencyError', statusCode: 400 });
          return seen.refund;
        }
        calls.create++;
        const refund = { id: `re_${refunds.length + 1}`, amount: params.amount, currency: 'eur', status: 'succeeded', payment_intent: params.payment_intent, metadata: params.metadata };
        refunds.push(refund);
        keys.set(idempotencyKey, { params: JSON.stringify(params), refund });
        return refund;
      },
    },
  };
  return { client, refunds, calls, keys };
}

const input = (over: Partial<Parameters<typeof refundLicense>[3]> = {}) => ({ amount: null, reason: 'requested_by_customer' as const, note: null, ...over });

describe('refund through Stripe (the admin button)', () => {
  it('full refund: refunds the payment once, marks the license refunded, and it leaves /verify, the console and the VAT total', async () => {
    const [org] = await t.db.insert(organizations).values({ name: 'Org AS' }).returning();
    const [buyer] = await t.db.insert(users).values({ email: 'buyer1@example.com', emailVerified: new Date() }).returning();
    await insert(stripeLicense(1, { org_id: org.id }));
    await insert(stripeLicense(2, { email_sha256: emailHash('buyer1@example.com') }));
    const stripe = fakeStripe({ cs_live_refundSession1: { payment_intent: 'pi_refund1', amount_total: 5900, email: 'Buyer1@Example.com' } });

    const out = await refundLicense(t.db, admin, 'L-refundLicense1', input({ note: 'Event cancelled.' }), { stripe: stripe.client, now });
    expect(out).toMatchObject({ amount: 5900, currency: 'eur', full: true, via: 'stripe', stripeRefundId: 're_1', status: 'succeeded', buyerEmail: 'buyer1@example.com' });
    expect(stripe.refunds).toEqual([
      expect.objectContaining({ amount: 5900, payment_intent: 'pi_refund1', metadata: { license_id: 'L-refundLicense1', payment_license_id: 'L-refundLicense1', actor: admin.id } }),
    ]);
    expect([...stripe.keys.keys()]).toEqual(['refund:L-refundLicense1:5900:0']);

    const r = await row('L-refundLicense1');
    expect(r).toMatchObject({ revoke_reason: 'refunded', refunded_amount: 5900, payment_intent: 'pi_refund1' });
    expect(publicCheck(r, today)).toMatchObject({ status: 'revoked' });
    // The console: gone from the organization and from "bought with your email".
    await t.db.insert((await import('../db/schema')).memberships).values({ orgId: org.id, userId: buyer.id, role: 'owner' });
    expect((await licensesForOrg(t.db, buyer.id, org.id)).map((l) => l.payload.id)).toEqual([]);
    const me = { id: buyer.id, email: buyer.email, emailVerified: buyer.emailVerified, name: null, isAdmin: false };
    expect((await unassignedLicenses(t.db, me)).map((l) => l.payload.id)).toEqual(['L-refundLicense2']);
    // Revenue and the VAT total: only license 2.
    expect((await salesBetween(t.db, new Date('2026-01-01'), now)).map((s) => s.licenseId)).toEqual(['L-refundLicense2']);
    const vat = await checkVatThreshold({ db: t.db, now, fetchImpl: async () => Response.json({ data: { dataSets: [{ series: { '0:0:0:0': { observations: { '0': ['10'] } } } }] } }) });
    expect(vat?.totalEurCents).toBe(5900);

    const [entry] = await audits('license.refund');
    expect(entry).toMatchObject({ actorUserId: admin.id, targetId: 'L-refundLicense1', orgId: org.id });
    expect(entry.details).toMatchObject({ via: 'stripe', refund: 're_1', amount: 5900, reason: 'requested_by_customer', refunded_total: 5900, marked: ['L-refundLicense1'] });
    expect((await t.db.select().from(adminNotes)).map((n) => n.body)).toEqual(['Event cancelled.']);

    // Never twice.
    await expect(refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: stripe.client, now })).rejects.toThrow(/already refunded/);
    expect(stripe.calls.create).toBe(1);
  });

  it('partial refund: records the amount, keeps the license valid, takes it off revenue; the rest later makes it full', async () => {
    await insert(stripeLicense(1));
    const stripe = fakeStripe({ cs_live_refundSession1: { payment_intent: 'pi_refund1', amount_total: 5900 } });
    const out = await refundLicense(t.db, admin, 'L-refundLicense1', input({ amount: 2000, reason: 'duplicate' }), { stripe: stripe.client, now });
    expect(out).toMatchObject({ amount: 2000, full: false });
    let r = await row('L-refundLicense1');
    expect(r).toMatchObject({ refunded_amount: 2000, revoked_at: null });
    expect(publicCheck(r, today).status).toBe('valid');
    expect(totals(await salesBetween(t.db, new Date('2026-01-01'), now), 10)).toEqual({ count: 1, eur: 39, nok: 390 });
    expect((await audits('license.refund_partial'))[0].details).toMatchObject({ amount: 2000, reason: 'duplicate', refunded_total: 2000 });

    await expect(refundLicense(t.db, admin, 'L-refundLicense1', input({ amount: 4000 }), { stripe: stripe.client, now })).rejects.toThrow(/At most 39.00 EUR/);
    // The same amount again is a new refund (the key carries what was refunded before).
    await refundLicense(t.db, admin, 'L-refundLicense1', input({ amount: 2000 }), { stripe: stripe.client, now });
    expect([...stripe.keys.keys()]).toEqual(['refund:L-refundLicense1:2000:0', 'refund:L-refundLicense1:2000:2000']);
    const last = await refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: stripe.client, now });
    expect(last).toMatchObject({ amount: 1900, full: true });
    r = await row('L-refundLicense1');
    expect(r).toMatchObject({ refunded_amount: 5900, revoke_reason: 'refunded' });
    expect(await salesBetween(t.db, new Date('2026-01-01'), now)).toEqual([]);
  });

  it('a double click makes one refund and one log entry', async () => {
    await insert(stripeLicense(1));
    const stripe = fakeStripe({ cs_live_refundSession1: { payment_intent: 'pi_refund1', amount_total: 5900 } });
    const results = await Promise.allSettled([
      refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: stripe.client, now }),
      refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: stripe.client, now }),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(RefundError);
    expect(stripe.refunds).toHaveLength(1);
    expect(await audits('license.refund')).toHaveLength(1);
    expect(await row('L-refundLicense1')).toMatchObject({ refunded_amount: 5900, revoke_reason: 'refunded' });
  });

  it('a payment already refunded in the Stripe Dashboard is caught up here, not refunded again', async () => {
    await insert(stripeLicense(1, { payment_intent: null }));
    const stripe = fakeStripe({ cs_live_refundSession1: { payment_intent: 'pi_refund1', amount_total: 5900 } });
    stripe.refunds.push({ id: 're_dash', amount: 5900, currency: 'eur', status: 'succeeded', payment_intent: 'pi_refund1' });
    await expect(refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: stripe.client, now })).rejects.toThrow(/already fully refunded/);
    expect(stripe.calls.create).toBe(0);
    expect(await row('L-refundLicense1')).toMatchObject({ refunded_amount: 5900, revoke_reason: 'refunded', payment_intent: 'pi_refund1' });
  });

  it('a missing key permission is a clear message and changes nothing', async () => {
    await insert(stripeLicense(1));
    const denied = () => Promise.reject(Object.assign(new Error('The provided key rk_live_****abcd does not have the required permissions'), { type: 'StripePermissionError', statusCode: 403 }));
    const stripe = fakeStripe({ cs_live_refundSession1: { payment_intent: 'pi_refund1', amount_total: 5900 } });
    const noSession = { ...stripe.client, checkout: { sessions: { ...stripe.client.checkout.sessions, retrieve: denied } } };
    await expect(refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: noSession, now })).rejects.toThrow(/Add Checkout Sessions: Read to the restricted key/);
    const noRefunds = { ...stripe.client, refunds: { ...stripe.client.refunds, create: denied } };
    const err = await refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: noRefunds, now }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefundError);
    expect((err as Error).message).toMatch(/Add Refunds: Write/);
    // Never the Stripe message (it can echo part of the key).
    expect((err as Error).message).not.toMatch(/rk_live/);
    expect(await row('L-refundLicense1')).toMatchObject({ refunded_amount: null, revoked_at: null });
    expect(await audits()).toEqual([]);
    await expect(refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: null, now })).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });

  it('a reissued license refunds the original checkout and marks the whole chain', async () => {
    await insert(stripeLicense(1, { superseded_by: 'L-refundLicense9' }));
    await insert(stripeLicense(9, { session_id: 'reissue_abc', supersedes: 'L-refundLicense1', amount_total: null, payment_intent: null }));
    const stripe = fakeStripe({ cs_live_refundSession1: { payment_intent: 'pi_refund1', amount_total: 5900 } });
    await expect(refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: stripe.client, now })).rejects.toThrow(/replaced by L-refundLicense9/);
    const out = await refundLicense(t.db, admin, 'L-refundLicense9', input(), { stripe: stripe.client, now });
    expect(out).toMatchObject({ paymentLicenseId: 'L-refundLicense1', full: true });
    expect(await row('L-refundLicense1')).toMatchObject({ refunded_amount: 5900, revoke_reason: 'refunded' });
    expect(await row('L-refundLicense9')).toMatchObject({ revoke_reason: 'refunded' });
  });
});

describe('manual (bank transfer) refunds', () => {
  const manual = (over: Partial<LicenseRecord> = {}) =>
    stripeLicense(5, { session_id: 'manual_0123456789abcdef', source: 'manual', amount_total: 950000, currency: 'nok', payment_intent: null, payment_ref: 'INV-5', ...over });

  it('records the refund without calling Stripe; partial first, then the rest', async () => {
    await insert(manual());
    const stripe = fakeStripe({});
    const out = await refundLicense(
      t.db,
      admin,
      'L-refundLicense5',
      input({ amount: 150000, manual: { refundedOn: new Date('2026-09-27T12:00:00Z'), reference: 'BANK-REF-1' } }),
      { stripe: stripe.client, now },
    );
    expect(out).toMatchObject({ via: 'manual', amount: 150000, currency: 'nok', full: false, stripeRefundId: null, status: 'recorded' });
    expect(stripe.calls).toEqual({ retrieve: 0, list: 0, create: 0 });
    expect(await row('L-refundLicense5')).toMatchObject({ refunded_amount: 150000, revoked_at: null, refunded_at: '2026-09-27T12:00:00.000Z' });
    expect((await audits('license.refund_partial'))[0].details).toMatchObject({ via: 'manual', reference: 'BANK-REF-1', refunded_on: '2026-09-27', currency: 'nok' });
    expect(totals(await salesBetween(t.db, new Date('2026-01-01'), now), 10)).toMatchObject({ nok: 8000 });

    await refundLicense(t.db, admin, 'L-refundLicense5', input(), { stripe: null, now });
    expect(await row('L-refundLicense5')).toMatchObject({ refunded_amount: 950000, revoke_reason: 'refunded' });
    expect(await salesBetween(t.db, new Date('2026-01-01'), now)).toEqual([]);
    await expect(refundLicense(t.db, admin, 'L-refundLicense5', input(), { stripe: null, now })).rejects.toThrow(/already refunded/);
  });

  it('refuses more than was paid, and a license with no amount', async () => {
    await insert(manual());
    await insert(manual({ session_id: 'manual_fedcba9876543210', amount_total: null, payload: { ...stripeLicense(6).payload } }));
    await expect(refundLicense(t.db, admin, 'L-refundLicense5', input({ amount: 950001 }), { stripe: null, now })).rejects.toThrow(/At most 9500.00 NOK/);
    await expect(refundLicense(t.db, admin, 'L-refundLicense6', input(), { stripe: null, now })).rejects.toThrow(/No amount was recorded/);
  });
});

describe('the webhook (charge.refunded, refund.failed)', () => {
  const charge = (over: Partial<Parameters<typeof syncChargeRefund>[1]> = {}) => ({
    id: 'ch_1',
    amount: 5900,
    amount_refunded: 5900,
    refunded: true,
    currency: 'eur',
    payment_intent: 'pi_refund1',
    ...over,
  });
  const noLookup = async () => null;

  it('full: marks it refunded, actor "stripe"; a redelivery changes nothing', async () => {
    await insert(stripeLicense(1));
    expect(await syncChargeRefund(t.db, charge(), noLookup, now)).toEqual({ status: 'refunded', licenseId: 'L-refundLicense1', refundedAmount: 5900 });
    expect(await row('L-refundLicense1')).toMatchObject({ revoke_reason: 'refunded', refunded_amount: 5900 });
    const [entry] = await audits('license.refund');
    expect(entry).toMatchObject({ actorUserId: 'stripe', targetId: 'L-refundLicense1' });
    expect(entry.details).toMatchObject({ via: 'stripe-webhook', charge: 'ch_1', amount: 5900 });
    expect(await syncChargeRefund(t.db, charge(), noLookup, now)).toMatchObject({ status: 'unchanged' });
    expect(await audits()).toHaveLength(1);
  });

  it('partial: records the amount, keeps the license; an older event arriving late never lowers it', async () => {
    await insert(stripeLicense(1));
    expect(await syncChargeRefund(t.db, charge({ amount_refunded: 1000, refunded: false }), noLookup, now)).toMatchObject({ status: 'partial', refundedAmount: 1000 });
    expect(await syncChargeRefund(t.db, charge({ amount_refunded: 2500, refunded: false }), noLookup, now)).toMatchObject({ status: 'partial', refundedAmount: 2500 });
    expect(await syncChargeRefund(t.db, charge({ amount_refunded: 1000, refunded: false }), noLookup, now)).toMatchObject({ status: 'unchanged', refundedAmount: 2500 });
    expect(await row('L-refundLicense1')).toMatchObject({ refunded_amount: 2500, revoked_at: null });
    expect((await audits('license.refund_partial')).map((a) => a.details.amount)).toEqual([1000, 1500]);
  });

  it('after the admin button, the webhook only confirms (no second log entry)', async () => {
    await insert(stripeLicense(1));
    const stripe = fakeStripe({ cs_live_refundSession1: { payment_intent: 'pi_refund1', amount_total: 5900 } });
    await refundLicense(t.db, admin, 'L-refundLicense1', input(), { stripe: stripe.client, now });
    expect(await syncChargeRefund(t.db, charge(), noLookup, now)).toMatchObject({ status: 'unchanged' });
    expect(await audits()).toHaveLength(1);
  });

  it('finds an older license (no stored PaymentIntent) through its Checkout Session; ignores other charges', async () => {
    await insert(stripeLicense(1, { payment_intent: null }));
    const lookup = vi.fn(async (pi: string) => (pi === 'pi_old' ? 'cs_live_refundSession1' : null));
    expect(await syncChargeRefund(t.db, charge({ payment_intent: 'pi_old' }), lookup, now)).toMatchObject({ status: 'refunded', licenseId: 'L-refundLicense1' });
    expect(await row('L-refundLicense1')).toMatchObject({ payment_intent: 'pi_old' });
    expect(await syncChargeRefund(t.db, charge({ payment_intent: 'pi_other' }), lookup, now)).toEqual({ status: 'unknown' });
    expect(await syncChargeRefund(t.db, charge({ payment_intent: null }), lookup, now)).toEqual({ status: 'unknown' });
  });

  it('a failed refund gives the amount back to revenue once; the key stays off, now as revoked', async () => {
    await insert(stripeLicense(1));
    await syncChargeRefund(t.db, charge(), noLookup, now);
    const failed = { id: 're_9', amount: 5900, currency: 'eur', status: 'failed', payment_intent: 'pi_refund1', metadata: {} };
    expect(await syncRefundFailure(t.db, failed, noLookup, now)).toMatchObject({ status: 'partial', refundedAmount: 0 });
    const r = await row('L-refundLicense1');
    expect(r).toMatchObject({ refunded_amount: null, revoke_reason: 'revoked' });
    expect(publicCheck(r, today).status).toBe('revoked');
    expect((await salesBetween(t.db, new Date('2026-01-01'), now)).map((s) => s.amountTotal)).toEqual([5900]);
    expect(await syncRefundFailure(t.db, failed, noLookup, now)).toMatchObject({ status: 'unchanged' });
    expect(await audits('license.refund_failed')).toHaveLength(1);
    expect((await t.db.select().from(adminNotes).where(and(eq(adminNotes.targetId, 'L-refundLicense1')))).map((n) => n.body)).toEqual([
      expect.stringContaining('re_9 failed'),
    ]);
    // A refund that simply succeeded is not a failure.
    expect(await syncRefundFailure(t.db, { ...failed, id: 're_10', status: 'succeeded' }, noLookup, now)).toEqual({ status: 'unknown' });
  });
});

describe('the refund email', () => {
  it('says what was refunded, escapes the licensee, and never carries the key', () => {
    const r = stripeLicense(1, {}, { licensee: '<b>Buyer</b> AS' });
    const full = refundEmail(r, { amount: 5900, currency: 'eur', full: true }, 'https://autotournament.gg');
    expect(full.subject).toBe('Your Auto Tournament license was refunded — L-refundLicense1');
    expect(full.text).toContain('We have refunded EUR 59.00');
    expect(full.text).toContain('no longer valid');
    expect(full.html).toContain('&lt;b&gt;Buyer&lt;/b&gt; AS');
    expect(full.text + full.html).not.toContain(r.token);
    expect(refundEmail(r, { amount: 1000, currency: 'eur', full: false }, 'https://autotournament.gg').text).toContain('The license stays valid.');
  });
});
