import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/db/client';
import { testDb } from '@/lib/db/testing';
import { auditLog, licenses, refundRequests, sessions, users } from '@/lib/db/schema';
import type { ConsoleUser } from '@/lib/console/orgs';
import { emailHash } from '@/lib/license/format';
import { toRow, type LicenseRecord } from '@/lib/license/store';
import type { RefundClient, StripeRefundLike } from '@/lib/license/refund';
import { REFUNDS_NEED_EMAIL } from '@/lib/license/refundRequests';

// The Refund button and its email confirmation, through the server actions,
// with the session, headers, Stripe and Postmark mocked (nothing leaves the
// process). The Refund button only asks: the refund runs when the admin who
// asked confirms through the link emailed to their own address.

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
// The passkey gate and approval pass here (tested in passkeys.routes.test.ts).
vi.mock('@/lib/admin/approval', () => ({
  gateFor: async () => 'ok',
  approvalError: async () => null,
  currentSessionHash: async () => null,
  gateText: { setup: 'setup', verify: 'verify' },
}));

let t: Awaited<ReturnType<typeof testDb>>;
let memberRow: typeof users.$inferSelect;
let adminCount = 0;
const ADMINS = Array.from({ length: 30 }, (_, i) => `admin${i}@example.com`);

const asUser = (row: typeof users.$inferSelect): ConsoleUser => ({ id: row.id, email: row.email, emailVerified: row.emailVerified, name: row.name, isAdmin: row.isAdmin });

/** A fresh admin per test: the rate limits are per admin and live for the whole file. */
async function newAdmin(): Promise<typeof users.$inferSelect> {
  const [row] = await t.db.insert(users).values({ email: ADMINS[adminCount++], emailVerified: new Date(), isAdmin: true }).returning();
  return row;
}

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
        retrieve: async (id) => {
          const n = id.replace('cs_live_actionSession', '');
          return { id, payment_intent: `pi_action${n}`, amount_total: 5900, currency: 'eur', customer_details: { email: `Buyer${n}@example.com` } };
        },
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

type Sent = { To: string; Subject: string; Tag: string; TextBody: string; HtmlBody: string };
let sent: Sent[] = [];

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const actions = () => import('./actions');
const row = async (id: string) => (await t.db.select().from(licenses).where(eq(licenses.licenseId, id)))[0];
const requestsFor = (id: string) => t.db.select().from(refundRequests).where(eq(refundRequests.licenseId, id));
const refundsFor = (n: number) => refunds.filter((r) => r.payment_intent === `pi_action${n}`);

/** The token in a confirmation email. */
function tokenFromEmail(mail: Sent | undefined): string {
  const m = mail?.TextBody.match(/[?&]token=([A-Za-z0-9_-]{43})/);
  if (!m) throw new Error('no token in the email');
  return m[1];
}

/** Asks for a refund as `admin` and returns the emailed token. */
async function ask(admin: typeof users.$inferSelect, fields: Record<string, string>): Promise<string> {
  state.user = asUser(admin);
  const before = sent.length;
  const result = await (await actions()).requestRefundAction(null, form({ reason: 'requested_by_customer', ...fields }));
  expect(result).toEqual({ ok: expect.stringMatching(/^Check your email to confirm this refund of .+ \(expires in 15 minutes\)/) });
  expect(sent.length).toBe(before + 1);
  return tokenFromEmail(sent.at(-1));
}

const confirm = async (admin: typeof users.$inferSelect, token: string) => {
  state.user = asUser(admin);
  return (await actions()).confirmRefundAction(null, form({ token }));
};

beforeAll(async () => {
  t = await testDb();
  setDb(t.db);
  [memberRow] = await t.db.insert(users).values({ email: 'member@example.com', emailVerified: new Date() }).returning();
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) await t.db.insert(licenses).values(toRow(license(n)));
}, 60_000);
afterAll(async () => {
  setDb(null);
  await t.close();
});
beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', ADMINS.join(','));
  vi.stubEnv('AUTH_URL', 'http://localhost:4611');
  vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.stripe = fake();
  sent = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return Response.json({ ErrorCode: 0, MessageID: `m-${sent.length}` });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('asking for a refund', () => {
  it('a non-admin gets "Not found.": no email, no request, no Stripe', async () => {
    const create = vi.fn();
    state.stripe = fake({ create });
    const { requestRefundAction } = await actions();
    for (const user of [null, asUser(memberRow)]) {
      state.user = user;
      expect(await requestRefundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'requested_by_customer' }))).toEqual({ error: 'Not found.' });
    }
    expect(sent).toEqual([]);
    expect(await requestsFor('L-actionLicense1')).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('without email set up, refunds are refused (never refunded without a confirmation)', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
    const create = vi.fn();
    state.stripe = fake({ create });
    state.user = asUser(await newAdmin());
    expect(await (await actions()).requestRefundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'requested_by_customer' }))).toEqual({ error: REFUNDS_NEED_EMAIL });
    expect(await requestsFor('L-actionLicense1')).toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect((await row('L-actionLicense1')).refundedAmount).toBeNull();
  });

  it('checks the form', async () => {
    state.user = asUser(await newAdmin());
    const { requestRefundAction } = await actions();
    expect(await requestRefundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'because' }))).toEqual({ error: 'Choose a reason.' });
    expect(await requestRefundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'duplicate', amount: '-5' }))).toMatchObject({ error: expect.stringMatching(/above 0/) });
    expect(await requestRefundAction(null, form({ licenseId: 'L-actionLicense1', reason: 'duplicate', amount: '100' }))).toMatchObject({ error: expect.stringMatching(/At most 59.00 EUR/) });
    expect(sent).toEqual([]);
  });

  it('a failed confirmation email withdraws the request', async () => {
    state.user = asUser(await newAdmin());
    vi.stubGlobal('fetch', async () => Response.json({ ErrorCode: 300 }, { status: 422 }));
    const result = await (await actions()).requestRefundAction(null, form({ licenseId: 'L-actionLicense11', reason: 'duplicate' }));
    expect(result).toMatchObject({ error: expect.stringMatching(/could not be sent/) });
    expect((await requestsFor('L-actionLicense11')).map((r) => r.status)).toEqual(['cancelled']);
  });

  it('5 requests per admin per hour; a new request cancels the older one', async () => {
    state.user = asUser(await newAdmin());
    const { requestRefundAction } = await actions();
    for (let i = 0; i < 5; i++) expect(await requestRefundAction(null, form({ licenseId: 'L-actionLicense10', reason: 'duplicate', amount: '1' }))).toHaveProperty('ok');
    expect(await requestRefundAction(null, form({ licenseId: 'L-actionLicense10', reason: 'duplicate', amount: '1' }))).toEqual({ error: expect.stringMatching(/Too many refund requests/) });
    const all = await requestsFor('L-actionLicense10');
    expect(all.filter((r) => r.status === 'pending')).toHaveLength(1);
    expect(all.filter((r) => r.status === 'cancelled')).toHaveLength(4);
  });
});

describe('confirming by email', () => {
  it('request → email to the admin’s own address → confirm → refunded', async () => {
    const admin = await newAdmin();
    const create = vi.fn(fake().refunds.create);
    state.stripe = fake({ create });
    const token = await ask(admin, { licenseId: 'L-actionLicense1', note: 'Asked by email.' });

    const mail = sent.at(-1)!;
    expect(mail).toMatchObject({ To: admin.email, Tag: 'admin-refund-confirm', Subject: 'Confirm refund of €59.00 for L-actionLicense1' });
    expect(mail.TextBody).toContain('Licensee: Buyer 1');
    expect(mail.TextBody).toContain('Pack: Servers M');
    expect(mail.TextBody).toContain('Reason: Requested by the customer');
    expect(mail.TextBody).toContain(`Asked by: ${admin.email}`);
    expect(mail.TextBody).toContain("If this wasn't you, ignore this email and sign out everywhere");
    expect(mail.TextBody).toContain(`/console/refunds/confirm?token=${token}&cancel=1`);
    expect(mail.TextBody).not.toContain('ATL1.');
    // Nothing moved yet.
    expect(create).not.toHaveBeenCalled();
    expect((await row('L-actionLicense1')).refundedAmount).toBeNull();
    const [pending] = await requestsFor('L-actionLicense1');
    expect(pending).toMatchObject({ status: 'pending', amount: 5900, currency: 'eur', adminUserId: admin.id });
    expect(pending.tokenHash).not.toContain(token);
    expect(pending.expiresAt.getTime() - pending.createdAt.getTime()).toBe(15 * 60_000);

    expect(await confirm(admin, token)).toEqual({ ok: 'Refunded €59.00 in Stripe. The license is marked refunded.' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(await row('L-actionLicense1')).toMatchObject({ revokeReason: 'refunded', refundedAmount: 5900 });
    const [done] = await requestsFor('L-actionLicense1');
    expect(done).toMatchObject({ status: 'confirmed', stripeRefundId: refundsFor(1)[0].id });
    const logged = (await t.db.select().from(auditLog).where(eq(auditLog.targetId, 'L-actionLicense1'))).map((a) => a.action);
    expect(logged).toEqual(expect.arrayContaining(['license.refund_request', 'license.refund', 'license.refund_request_confirm']));
    expect(idempotencyKeys.at(-1)).toBe('refund:L-actionLicense1:5900:0');

    // The token is single use.
    expect(await confirm(admin, token)).toEqual({ error: expect.stringMatching(/already confirmed/) });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('opening the link (GET) changes nothing', async () => {
    const admin = await newAdmin();
    const create = vi.fn();
    state.stripe = fake({ create });
    const token = await ask(admin, { licenseId: 'L-actionLicense2', amount: '10' });
    const { default: ConfirmRefund } = await import('../refunds/confirm/page');
    for (const params of [{ token }, { token, cancel: '1' }]) await ConfirmRefund({ searchParams: Promise.resolve(params) });
    expect(create).not.toHaveBeenCalled();
    expect((await requestsFor('L-actionLicense2'))[0].status).toBe('pending');
    expect((await row('L-actionLicense2')).refundedAmount).toBeNull();
  });

  it('only the admin who asked can confirm', async () => {
    const asker = await newAdmin();
    const other = await newAdmin();
    const token = await ask(asker, { licenseId: 'L-actionLicense2', amount: '10' });
    expect(await confirm(other, token)).toEqual({ error: expect.stringMatching(/Only the admin who asked/) });
    state.user = asUser(memberRow);
    expect(await (await actions()).confirmRefundAction(null, form({ token }))).toEqual({ error: 'Not found.' });
    expect(refundsFor(2)).toEqual([]);
    expect((await requestsFor('L-actionLicense2')).find((r) => r.status === 'pending')).toBeTruthy();
    const refused = await t.db.select().from(auditLog).where(and(eq(auditLog.action, 'license.refund_confirm_refused'), eq(auditLog.actorUserId, other.id)));
    expect(refused).toHaveLength(1);
    // The one who asked still can.
    expect(await confirm(asker, token)).toEqual({ ok: 'Refunded €10.00 in Stripe. Partial refund: the license stays valid.' });
  });

  it('an expired link refunds nothing, and the prune job deletes it', async () => {
    const admin = await newAdmin();
    const token = await ask(admin, { licenseId: 'L-actionLicense3' });
    await t.db.update(refundRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(refundRequests.licenseId, 'L-actionLicense3'));
    expect(await confirm(admin, token)).toEqual({ error: expect.stringMatching(/expired/) });
    expect(refundsFor(3)).toEqual([]);
    const { pruneExpired } = await import('@/lib/db/prune');
    expect((await pruneExpired(t.db)).refundRequests).toBeGreaterThanOrEqual(1);
    expect(await requestsFor('L-actionLicense3')).toEqual([]);
  });

  it('a malformed or unknown token refunds nothing', async () => {
    const admin = await newAdmin();
    expect(await confirm(admin, 'nope')).toEqual({ error: expect.stringMatching(/isn’t valid/) });
    expect(await confirm(admin, 'A'.repeat(43))).toEqual({ error: expect.stringMatching(/isn’t valid/) });
  });

  it('cancelled from the email link (and signed out everywhere): confirm is refused', async () => {
    const admin = await newAdmin();
    const token = await ask(admin, { licenseId: 'L-actionLicense5' });
    await t.db.insert(sessions).values([
      { sessionToken: `s-${admin.id}-1`, userId: admin.id, expires: new Date(Date.now() + 86_400_000) },
      { sessionToken: `s-${admin.id}-2`, userId: admin.id, expires: new Date(Date.now() + 86_400_000) },
    ]);
    state.user = null;
    const { cancelRefundByLinkAction } = await import('../refunds/actions');
    expect(await cancelRefundByLinkAction(null, form({ token, signOut: 'yes' }))).toEqual({ ok: expect.stringMatching(/^Cancelled\. Nothing was refunded\. Signed out of 2 sessions/) });
    expect(await t.db.select().from(sessions).where(eq(sessions.userId, admin.id))).toEqual([]);
    expect(await confirm(admin, token)).toEqual({ error: expect.stringMatching(/cancelled/) });
    expect(refundsFor(5)).toEqual([]);
    expect((await requestsFor('L-actionLicense5'))[0]).toMatchObject({ status: 'cancelled' });
  });

  it('cancelled from the license page: confirm is refused', async () => {
    const admin = await newAdmin();
    const token = await ask(admin, { licenseId: 'L-actionLicense5' });
    const [pending] = (await requestsFor('L-actionLicense5')).filter((r) => r.status === 'pending');
    state.user = asUser(admin);
    expect(await (await actions()).cancelRefundRequestAction(null, form({ requestId: pending.id }))).toEqual({ ok: 'Cancelled. Nothing was refunded.' });
    expect(await confirm(admin, token)).toEqual({ error: expect.stringMatching(/cancelled/) });
    expect(refundsFor(5)).toEqual([]);
  });

  it('a new request cancels the older one', async () => {
    const admin = await newAdmin();
    const first = await ask(admin, { licenseId: 'L-actionLicense6', amount: '5' });
    const second = await ask(admin, { licenseId: 'L-actionLicense6', amount: '7' });
    expect(await confirm(admin, first)).toEqual({ error: expect.stringMatching(/cancelled/) });
    expect(await confirm(admin, second)).toEqual({ ok: 'Refunded €7.00 in Stripe. Partial refund: the license stays valid.' });
    expect(refundsFor(6).map((r) => r.amount)).toEqual([700]);
  });

  it('a double confirm makes one refund', async () => {
    const admin = await newAdmin();
    const token = await ask(admin, { licenseId: 'L-actionLicense7', amount: '10' });
    state.user = asUser(admin);
    const { confirmRefundAction } = await actions();
    const [a, b] = await Promise.all([confirmRefundAction(null, form({ token })), confirmRefundAction(null, form({ token }))]);
    expect([a, b]).toContainEqual({ ok: 'Refunded €10.00 in Stripe. Partial refund: the license stays valid.' });
    expect([a, b]).toContainEqual({ error: expect.stringMatching(/being made right now|already confirmed/) });
    expect(refundsFor(7)).toHaveLength(1);
    expect(await row('L-actionLicense7')).toMatchObject({ refundedAmount: 1000, revokedAt: null });
  });

  it('a refused Stripe refund puts the request back, so it can be retried', async () => {
    const admin = await newAdmin();
    state.stripe = fake({
      create: async () => {
        throw Object.assign(new Error('The provided key does not have the required permissions'), { type: 'StripePermissionError', statusCode: 403 });
      },
    });
    const token = await ask(admin, { licenseId: 'L-actionLicense8' });
    expect((await confirm(admin, token))?.error).toMatch(/Add Refunds: Write to the restricted key/);
    expect(await row('L-actionLicense8')).toMatchObject({ refundedAmount: null, revokedAt: null });
    expect((await requestsFor('L-actionLicense8'))[0].status).toBe('pending');
    state.stripe = fake();
    expect(await confirm(admin, token)).toEqual({ ok: 'Refunded €59.00 in Stripe. The license is marked refunded.' });
  });

  it('emails the buyer after the confirm when asked, at the address from the checkout', async () => {
    const admin = await newAdmin();
    const token = await ask(admin, { licenseId: 'L-actionLicense9', notify: 'yes' });
    expect(await confirm(admin, token)).toEqual({ ok: 'Refunded €59.00 in Stripe. The license is marked refunded. The buyer was emailed.' });
    expect(sent.at(-1)).toEqual(expect.objectContaining({ To: 'buyer9@example.com', Tag: 'license-refund', Subject: 'Your Auto Tournament license was refunded — L-actionLicense9' }));
    expect(sent.at(-1)!.TextBody).not.toContain('ATL1.');
    expect((await requestsFor('L-actionLicense9'))[0].sendTo).toBeNull();
  });
});
