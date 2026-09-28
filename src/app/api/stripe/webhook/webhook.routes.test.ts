import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/db/client';
import { testDb } from '@/lib/db/testing';
import { auditLog, licenses } from '@/lib/db/schema';
import { toRow, type LicenseRecord } from '@/lib/license/store';

// The webhook's refund events, signed like Stripe signs them (offline, with a
// test secret) against an in-memory Postgres. Issuing has its own tests.

const lookups: string[] = [];
vi.mock('@/lib/license/issue', () => ({
  issueForSession: vi.fn(async () => ({ status: 'existing' })),
  stripeServer: () => ({
    checkout: {
      sessions: {
        list: async ({ payment_intent }: { payment_intent: string }) => {
          lookups.push(payment_intent);
          return { data: payment_intent === 'pi_legacy' ? [{ id: 'cs_live_webhookSession2' }] : [] };
        },
      },
    },
  }),
}));

const secret = 'whsec_test_secret_for_the_route_test';
let t: Awaited<ReturnType<typeof testDb>>;

function license(n: number, over: Partial<LicenseRecord> = {}): LicenseRecord {
  return {
    session_id: `cs_live_webhookSession${n}`,
    invoice_number: null,
    email_sha256: null,
    livemode: true,
    dates_from_form: false,
    token: `ATL1.webhook${n}.sig`,
    amount_total: 5900,
    currency: 'eur',
    paid_at: '2026-09-20T10:00:00.000Z',
    payment_intent: `pi_webhook${n}`,
    payload: { v: 1, kid: 'k', id: `L-webhookLicense${n}`, customer: 'cus_X', product: 'servers', pack: 'M', max_servers: 20, kind: 'year', issued_at: '2026-09-20T10:00:00Z', updates_until: '2027-09-20' },
    ...over,
  };
}

function signed(type: string, object: Record<string, unknown>, id = `evt_${Math.random().toString(36).slice(2)}`): Request {
  const payload = JSON.stringify({ id, object: 'event', type, livemode: true, created: Math.floor(Date.now() / 1000), data: { object } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request('http://localhost/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': header, 'content-type': 'application/json' }, body: payload });
}

const charge = (over: Record<string, unknown> = {}) => ({ id: 'ch_1', object: 'charge', amount: 5900, amount_refunded: 5900, refunded: true, currency: 'eur', payment_intent: 'pi_webhook1', ...over });
const row = async (id: string) => (await t.db.select().from(licenses).where(eq(licenses.licenseId, id)))[0];

beforeAll(async () => {
  t = await testDb();
  setDb(t.db);
  await t.db.insert(licenses).values([toRow(license(1)), toRow(license(2, { payment_intent: null })), toRow(license(3))]);
}, 60_000);
afterAll(async () => {
  setDb(null);
  await t.close();
});
beforeEach(() => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/stripe/webhook: refunds', () => {
  it('refuses a bad signature', async () => {
    const { POST } = await import('./route');
    const req = signed('charge.refunded', charge());
    const res = await POST(new Request(req.url, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: await req.text() }));
    expect(res.status).toBe(400);
    expect((await row('L-webhookLicense1')).revokedAt).toBeNull();
  });

  it('charge.refunded in full marks the license refunded; the same event again changes nothing', async () => {
    const { POST } = await import('./route');
    const res = await POST(signed('charge.refunded', charge(), 'evt_full'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, refund: 'refunded' });
    expect(await row('L-webhookLicense1')).toMatchObject({ revokeReason: 'refunded', refundedAmount: 5900 });
    const again = await POST(signed('charge.refunded', charge(), 'evt_full'));
    expect(await again.json()).toEqual({ received: true, refund: 'unchanged' });
    const entries = await t.db.select().from(auditLog).where(eq(auditLog.targetId, 'L-webhookLicense1'));
    expect(entries.map((e) => [e.action, e.actorUserId])).toEqual([['license.refund', 'stripe']]);
  });

  it('a partial charge.refunded records the amount and keeps the license', async () => {
    const { POST } = await import('./route');
    const res = await POST(signed('charge.refunded', charge({ id: 'ch_3', payment_intent: 'pi_webhook3', amount_refunded: 1500, refunded: false })));
    expect(await res.json()).toEqual({ received: true, refund: 'partial' });
    expect(await row('L-webhookLicense3')).toMatchObject({ refundedAmount: 1500, revokedAt: null });
  });

  it('finds an older license through its Checkout Session, and ignores charges that are not licenses', async () => {
    const { POST } = await import('./route');
    expect(await (await POST(signed('charge.refunded', charge({ id: 'ch_2', payment_intent: 'pi_legacy' })))).json()).toEqual({ received: true, refund: 'refunded' });
    expect(await row('L-webhookLicense2')).toMatchObject({ revokeReason: 'refunded', paymentIntent: 'pi_legacy' });
    expect(await (await POST(signed('charge.refunded', charge({ id: 'ch_9', payment_intent: 'pi_somethingelse' })))).json()).toEqual({ received: true, refund: 'unknown' });
    expect(lookups).toEqual(['pi_legacy', 'pi_somethingelse']);
  });

  it('refund.failed puts the payment back into revenue; the key stays off', async () => {
    const { POST } = await import('./route');
    const refund = { id: 're_fail', object: 'refund', amount: 5900, currency: 'eur', status: 'failed', payment_intent: 'pi_webhook1', metadata: {} };
    expect((await POST(signed('refund.failed', refund))).status).toBe(200);
    expect(await row('L-webhookLicense1')).toMatchObject({ revokeReason: 'revoked', refundedAmount: null });
    // refund.updated for the same refund (Stripe sends both): once only.
    expect(await (await POST(signed('refund.updated', refund))).json()).toEqual({ received: true, refund: 'unchanged' });
    expect(await t.db.select().from(auditLog).where(eq(auditLog.action, 'license.refund_failed'))).toHaveLength(1);
  });

  it('other events are acknowledged and ignored', async () => {
    const { POST } = await import('./route');
    const res = await POST(signed('customer.updated', { id: 'cus_X', object: 'customer' }));
    expect(await res.json()).toEqual({ received: true });
  });
});
