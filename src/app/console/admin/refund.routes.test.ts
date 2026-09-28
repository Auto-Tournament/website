import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/db/client';
import { testDb } from '@/lib/db/testing';
import { auditLog, licenses, users } from '@/lib/db/schema';
import type { ConsoleUser } from '@/lib/console/orgs';
import { emailHash } from '@/lib/license/format';
import { toRow, type LicenseRecord } from '@/lib/license/store';
import type { RefundClient, StripeRefundLike } from '@/lib/license/refund';

// The Refund button's server action, with the session, headers and the Stripe
// client mocked (nothing talks to Stripe or Postmark).

const state: { user: ConsoleUser | null; stripe: RefundClient | null } = { user: null, stripe: null };

vi.mock('@/lib/console/session', () => ({
  currentUser: async () => state.user,
  requireUser: async () => state.user,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'sec-fetch-site': 'same-origin', host: 'localhost:4611' }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/console/auth', () => ({ consoleEnabled: () => true }));
vi.mock('@/lib/license/issue', () => ({ stripeServer: () => state.stripe }));

let t: Awaited<ReturnType<typeof testDb>>;
let adminRow: typeof users.$inferSelect;
let memberRow: typeof users.$inferSelect;
const asUser = (row: typeof users.$inferSelect): ConsoleUser => ({ id: row.id, email: row.email, emailVerified: row.emailVerified, name: row.name, isAdmin: row.isAdmin });

function license(n: number): LicenseRecord {
  return {
    session_id: `cs_live_actionSession${n}`,
    invoice_number: null,
    email_sha256: emailHash(`buyer${n}@example.com`),
    livemode: true,
    dates_from_form: false,
    token: `ATL1.action${n}.sig`,
    amount_total: 5900,
    currency: 'eur',
    paid_at: '2026-09-20T10:00:00.000Z',
    payment_intent: `pi_action${n}`,
    payload: { v: 1, kid: 'k', id: `L-actionLicense${n}`, customer: 'cus_X', licensee: `Buyer ${n}`, product: 'servers', pack: 'M', max_servers: 20, kind: 'year', issued_at: '2026-09-20T10:00:00Z', updates_until: '2027-09-20' },
  };
}

const refunds: StripeRefundLike[] = [];
const idempotencyKeys: string[] = [];
function fake(over: Partial<RefundClient['refunds']> = {}): RefundClient {
  return {
    checkout: {
      sessions: {
        retrieve: async (id) => ({ id, payment_intent: `pi_action${id.slice(-1)}`, amount_total: 5900, currency: 'eur', customer_details: { email: `Buyer${id.slice(-1)}@example.com` } }),
        list: async () => ({ data: [] }),
      },
    },
    refunds: {
      list: async ({ payment_intent }) => ({ data: refunds.filter((r) => r.payment_intent === payment_intent) }),
      create: async (params, { idempotencyKey }) => {
        // Slow enough that a second click arrives while the first is still running.
        await new Promise((r) => setTimeout(r, 50));
        idempotencyKeys.push(idempotencyKey);
        const refund = { id: `re_${refunds.length + 1}`, amount: params.amount, currency: 'eur', status: 'succeeded', payment_intent: params.payment_intent };
        refunds.push(refund);
        return refund;
      },
      ...over,
    },
  };
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeAll(async () => {
  t = await testDb();
  setDb(t.db);
  [adminRow] = await t.db.insert(users).values({ email: 'sivert@example.com', emailVerified: new Date(), isAdmin: true }).returning();
  [memberRow] = await t.db.insert(users).values({ email: 'member@example.com', emailVerified: new Date() }).returning();
  for (const n of [1, 2, 3, 4]) await t.db.insert(licenses).values(toRow(license(n)));
}, 60_000);
afterAll(async () => {
  setDb(null);
  await t.close();
});
beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', 'sivert@example.com');
  vi.stubEnv('AUTH_URL', 'http://localhost:4611');
  vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.stripe = fake();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const row = async (id: string) => (await t.db.select().from(licenses).where(eq(licenses.licenseId, id)))[0];

describe('refundAction', () => {
  it('a non-admin gets "Not found." and Stripe is never called', async () => {
    const create = vi.fn();
    state.stripe = fake({ create });
    for (const user of [null, asUser(memberRow)]) {
      state.user = user;
      expect(await (await import('./actions')).refundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'requested_by_customer' }))).toEqual({ error: 'Not found.' });
    }
    expect(create).not.toHaveBeenCalled();
    expect((await row('L-actionLicense1')).revokedAt).toBeNull();
  });

  it('refunds in full and marks the license refunded', async () => {
    state.user = asUser(adminRow);
    const { refundAction } = await import('./actions');
    expect(await refundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'requested_by_customer', note: 'Asked by email.' }))).toEqual({
      ok: 'Refunded EUR 59.00 in Stripe. The license is marked refunded.',
    });
    expect(await row('L-actionLicense1')).toMatchObject({ revokeReason: 'refunded', refundedAmount: 5900 });
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.targetId, 'L-actionLicense1'));
    expect(entry).toMatchObject({ action: 'license.refund', actorUserId: adminRow.id });
  });

  it('a double click refunds once', async () => {
    state.user = asUser(adminRow);
    const { refundAction } = await import('./actions');
    const before = refunds.length;
    const fields = { licenseId: 'L-actionLicense2', reason: 'duplicate', amount: '10' };
    const [a, b] = await Promise.all([refundAction(null, form(fields)), refundAction(null, form(fields))]);
    expect([a, b]).toContainEqual({ ok: 'Refunded EUR 10.00 in Stripe. Partial refund: the license stays valid.' });
    expect([a, b]).toContainEqual({ error: expect.stringMatching(/already running/) });
    expect(refunds.length - before).toBe(1);
    expect(await row('L-actionLicense2')).toMatchObject({ refundedAmount: 1000, revokedAt: null });
  });

  it('a missing Stripe permission reads as what to add to the key', async () => {
    state.user = asUser(adminRow);
    state.stripe = fake({
      create: async () => {
        throw Object.assign(new Error('The provided key does not have the required permissions'), { type: 'StripePermissionError', statusCode: 403 });
      },
    });
    const { refundAction } = await import('./actions');
    const result = await refundAction(null, form({ licenseId: 'L-actionLicense3', reason: 'requested_by_customer' }));
    expect(result?.error).toMatch(/Add Refunds: Write to the restricted key/);
    expect(await row('L-actionLicense3')).toMatchObject({ refundedAmount: null, revokedAt: null });
  });

  it('emails the buyer when asked, at the address from the checkout', async () => {
    state.user = asUser(adminRow);
    vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token');
    const sent: { To: string; Subject: string; Tag: string; TextBody: string }[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({ ErrorCode: 0, MessageID: 'm-1' });
    });
    const { refundAction } = await import('./actions');
    const result = await refundAction(null, form({ licenseId: 'L-actionLicense4', reason: 'requested_by_customer', notify: 'yes' }));
    expect(result).toEqual({ ok: 'Refunded EUR 59.00 in Stripe. The license is marked refunded. The buyer was emailed.' });
    expect(sent).toEqual([expect.objectContaining({ To: 'buyer4@example.com', Tag: 'license-refund', Subject: 'Your Auto Tournament license was refunded — L-actionLicense4' })]);
    expect(sent[0].TextBody).not.toContain('ATL1.');
  });

  it('checks the form', async () => {
    state.user = asUser(adminRow);
    const { refundAction } = await import('./actions');
    expect(await refundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'because' }))).toEqual({ error: 'Choose a reason.' });
    expect(await refundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'duplicate', amount: '-5' }))).toMatchObject({ error: expect.stringMatching(/above 0/) });
    expect(idempotencyKeys.every((k) => /^refund:L-actionLicense\d:\d+:\d+$/.test(k))).toBe(true);
  });
});
