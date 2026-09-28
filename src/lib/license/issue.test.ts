import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { setDb } from '../db/client';
import { testDb } from '../db/testing';
import { users } from '../db/schema';
import { createOrg, getOrg, licensesForOrg } from '../console/orgs';
import { emailHash } from './format';
import { issueForSession } from './issue';
import { licenseStore } from './store';
import { publicCheck } from './verify';

// The webhook and the thanks page both go through issueForSession: here it runs
// against a real (in-memory) Postgres, as it does in production.

let t: Awaited<ReturnType<typeof testDb>>;

beforeEach(async () => {
  t = await testDb();
  setDb(t.db);
  const { privateKey } = generateKeyPairSync('ed25519');
  vi.stubEnv('LICENSE_SIGNING_KEY', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDb(null);
  await t.close();
});

function session(id: string, metadata: Record<string, string> = {}): Stripe.Checkout.Session {
  return {
    id,
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    created: 1_790_000_000,
    livemode: true,
    customer: 'cus_BUYER12345',
    customer_details: { email: 'Buyer@Example.com', business_name: 'Example LAN AS' },
    metadata: { pack: 'servers-m', period: 'year', max_servers: '20', ...metadata },
    custom_fields: [],
    invoice: null,
  } as unknown as Stripe.Checkout.Session;
}

describe('issuing against the database', () => {
  it('issues one key per session, and the public check finds it', async () => {
    const now = new Date('2026-09-28T10:00:00Z');
    const [a, b] = await Promise.all([issueForSession(session('cs_live_one'), now), issueForSession(session('cs_live_one'), now)]);
    expect([a.status, b.status].sort()).toEqual(['existing', 'issued']);
    if (a.status !== 'issued' && a.status !== 'existing') throw new Error('not issued');
    const stored = await licenseStore().bySession('cs_live_one');
    expect(stored?.token).toBe(a.record.token);
    expect(stored?.email_sha256).toBe(emailHash('buyer@example.com'));
    expect(stored?.org_id).toBeNull();
    const check = publicCheck(await licenseStore().byLicenseId(a.record.payload.id), '2026-10-01');
    expect(check.status).toBe('valid');
    expect(await licenseStore().founderCount()).toBe(0);
  });

  it('a checkout from the console lands in its organization, which takes the Stripe customer', async () => {
    const [user] = await t.db.insert(users).values({ email: 'buyer@example.com', emailVerified: new Date() }).returning();
    const me = { id: user.id, email: user.email, emailVerified: user.emailVerified, name: null, isAdmin: false };
    const orgId = await createOrg(t.db, me, { name: 'Org', orgNumber: null, vatId: null, country: null, addressLine1: null, addressLine2: null, postalCode: null, city: null });
    const result = await issueForSession(session('cs_live_org', { org_id: orgId }));
    expect(result.status).toBe('issued');
    expect((await licensesForOrg(t.db, user.id, orgId)).map((l) => l.session_id)).toEqual(['cs_live_org']);
    expect((await getOrg(t.db, user.id, orgId))?.stripeCustomerId).toBe('cus_BUYER12345');
    // An org id that doesn't exist (deleted since) is ignored: the license is issued unassigned.
    await issueForSession(session('cs_live_gone', { org_id: '00000000-0000-4000-8000-000000000000' }));
    expect((await licenseStore().bySession('cs_live_gone'))?.org_id).toBeNull();
  });

  it('refuses unpaid and foreign sessions', async () => {
    expect((await issueForSession({ ...session('cs_live_x'), payment_status: 'unpaid' } as Stripe.Checkout.Session)).status).toBe('not_paid');
    expect((await issueForSession({ ...session('cs_live_y'), metadata: {} } as Stripe.Checkout.Session)).status).toBe('not_license');
  });
});
