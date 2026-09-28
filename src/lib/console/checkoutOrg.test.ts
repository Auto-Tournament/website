import { generateKeyPairSync } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { setDb } from '../db/client';
import { testDb } from '../db/testing';
import { auditLog, licenses, memberships, organizations, orgPendingOwners, users } from '../db/schema';
import { emailHash } from '../license/format';
import { issueForSession } from '../license/issue';
import { licenseStore, toRow, type LicenseRecord } from '../license/store';
import { describeOrgEvent, orgDetail } from '../admin/customers';
import { backfillCheckoutOrgs, checkoutCompany, claimPendingOwnership, consoleHomePath, type CheckoutSessionLike } from './checkoutOrg';
import { createOrg, licensesForOrg, listOrgs, unassignedLicenses, type ConsoleUser } from './orgs';

// A card purchase makes (or finds) the buyer's organization, and signing in
// with the verified email makes them its owner. Against PGlite, through
// issueForSession: the same code path as the webhook and the thanks page.

let t: Awaited<ReturnType<typeof testDb>>;

beforeEach(async () => {
  t = await testDb();
  setDb(t.db);
  const { privateKey } = generateKeyPairSync('ed25519');
  vi.stubEnv('LICENSE_SIGNING_KEY', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
  // A live key's mode, without a key: no Stripe calls anywhere.
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('VAT_ALERTS', 'off');
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDb(null);
  await t.close();
});

type Over = { email?: string; customer?: string; vat?: { type: string; value: string } | null; metadata?: Record<string, string>; business?: string };

function session(id: string, over: Over = {}): Stripe.Checkout.Session {
  return {
    id,
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    created: 1_790_000_000,
    livemode: true,
    customer: over.customer ?? `cus_${id.slice(-8)}`,
    customer_details: {
      email: over.email ?? 'Buyer@Example.com',
      business_name: over.business ?? 'Example LAN AS',
      name: 'Kari Nordmann',
      address: { line1: 'Storgata 1', line2: null, postal_code: '0155', city: 'Oslo', country: 'NO', state: null },
      tax_ids: over.vat === null ? [] : [over.vat ?? { type: 'no_vat', value: '123456789MVA' }],
    },
    collected_information: { business_name: over.business ?? 'Example LAN AS' },
    metadata: { pack: 'servers-m', period: 'year', max_servers: '20', ...over.metadata },
    custom_fields: [{ key: 'eventname', text: { value: 'Client Event Ltd, client.example' } }],
    invoice: null,
  } as unknown as Stripe.Checkout.Session;
}

async function signUp(email: string, verified = true): Promise<ConsoleUser> {
  const [u] = await t.db
    .insert(users)
    .values({ email, emailVerified: verified ? new Date() : null })
    .returning();
  return { id: u.id, email: u.email, emailVerified: u.emailVerified, name: null, isAdmin: false };
}

const orgs = () => t.db.select().from(organizations);
const pending = () => t.db.select().from(orgPendingOwners);
const members = (orgId: string) => t.db.select().from(memberships).where(eq(memberships.orgId, orgId));
const orgOf = async (sessionId: string) => (await licenseStore().bySession(sessionId))?.org_id ?? null;

describe('checkoutCompany', () => {
  it('takes the company from the business name, never from the event/client field', () => {
    const c = checkoutCompany(session('cs_live_company') as unknown as CheckoutSessionLike);
    expect(c).toMatchObject({
      name: 'Example LAN AS',
      vatId: '123456789MVA',
      orgNumber: '123456789',
      country: 'NO',
      addressLine1: 'Storgata 1',
      postalCode: '0155',
      city: 'Oslo',
      email: 'buyer@example.com',
    });
    expect(c.matchKeys).toEqual(expect.arrayContaining(['123456789MVA', '123456789', 'NO123456789MVA']));
    expect(JSON.stringify(c)).not.toContain('Client Event');
  });
});

describe('a new buyer', () => {
  it('gets an organization with the license and a pending owner; signing in makes them owner and / goes to /licenses', async () => {
    const result = await issueForSession(session('cs_live_newBuyer01'));
    expect(result.status).toBe('issued');

    const [org] = await orgs();
    expect(org).toMatchObject({ name: 'Example LAN AS', vatId: '123456789MVA', orgNumber: '123456789', country: 'NO', city: 'Oslo', stripeCustomerId: 'cus_wBuyer01' });
    expect(await orgOf('cs_live_newBuyer01')).toBe(org.id);
    if (result.status === 'issued') expect(result.record.org_id).toBe(org.id);

    // Only the hash of the buyer's email: no user, no plain address anywhere.
    expect(await pending()).toEqual([expect.objectContaining({ orgId: org.id, emailHash: emailHash('buyer@example.com'), sessionId: 'cs_live_newBuyer01' })]);
    expect(await t.db.select().from(users)).toEqual([]);
    const audit = await t.db.select().from(auditLog).where(eq(auditLog.orgId, org.id));
    expect(JSON.stringify(audit)).not.toContain('buyer@example.com');

    // The admin's view of the organization says where it came from.
    const detail = await orgDetail(t.db, org.id);
    expect(detail?.history.map(describeOrgEvent)).toContain('Created from checkout cs_live_newBuyer01');
    expect(detail?.pendingOwners).toBe(1);

    // First sign-in with the verified address.
    const me = await signUp('buyer@example.com');
    expect(await claimPendingOwnership(t.db, me.id)).toEqual([org.id]);
    expect(await members(org.id)).toEqual([expect.objectContaining({ userId: me.id, role: 'owner' })]);
    expect(await pending()).toEqual([]);
    expect(await consoleHomePath(t.db, me)).toBe('/licenses');
    expect((await licensesForOrg(t.db, me.id, org.id)).map((l) => l.session_id)).toEqual(['cs_live_newBuyer01']);
    // Nothing left for the claim box.
    expect(await unassignedLicenses(t.db, me)).toEqual([]);
    // Again (another sign-in): nothing changes.
    expect(await claimPendingOwnership(t.db, me.id)).toEqual([]);
    expect(await members(org.id)).toHaveLength(1);
  });

  it('/ takes up pending ownership itself when the sign-in event did not', async () => {
    await issueForSession(session('cs_live_newBuyer02'));
    const me = await signUp('buyer@example.com');
    expect(await consoleHomePath(t.db, me)).toBe('/licenses');
    expect(await listOrgs(t.db, me.id)).toHaveLength(1);
  });

  it('an unverified email gets no access, at issue or at sign-in', async () => {
    const me = await signUp('buyer@example.com', false);
    await issueForSession(session('cs_live_unverified'));
    const [org] = await orgs();
    // Not made owner at issue, although a user with that (unverified) address exists.
    expect(await members(org.id)).toEqual([]);
    expect(await pending()).toHaveLength(1);
    expect(await claimPendingOwnership(t.db, me.id)).toEqual([]);
    expect(await members(org.id)).toEqual([]);
    expect(await consoleHomePath(t.db, me)).toBe('/welcome');
    // Someone else, verified, with another address: nothing either.
    const other = await signUp('other@example.com');
    expect(await claimPendingOwnership(t.db, other.id)).toEqual([]);
    expect(await consoleHomePath(t.db, other)).toBe('/welcome');
  });

  it('a buyer who already has a verified account is owner at once', async () => {
    const me = await signUp('buyer@example.com');
    await issueForSession(session('cs_live_knownUser1'));
    const [org] = await orgs();
    expect(await members(org.id)).toEqual([expect.objectContaining({ userId: me.id, role: 'owner' })]);
    expect(await pending()).toEqual([]);
  });
});

describe('returning customers', () => {
  it('same VAT id (any formatting) and the same buyer: the same organization, before and after sign-in', async () => {
    await issueForSession(session('cs_live_returning1'));
    // Before sign-in: linked through the pending owner.
    await issueForSession(session('cs_live_returning2', { vat: { type: 'eu_vat', value: 'no 123 456 789 mva' } }));
    const me = await signUp('buyer@example.com');
    await claimPendingOwnership(t.db, me.id);
    // After: linked through the membership.
    await issueForSession(session('cs_live_returning3'));
    const all = await orgs();
    expect(all).toHaveLength(1);
    for (const id of ['cs_live_returning1', 'cs_live_returning2', 'cs_live_returning3']) expect(await orgOf(id)).toBe(all[0].id);
    expect(await members(all[0].id)).toHaveLength(1);
  });

  it("the same Stripe customer: that customer's organization", async () => {
    const me = await signUp('owner@example.com');
    const orgId = await createOrg(t.db, me, { name: 'Org', orgNumber: null, vatId: null, country: null, addressLine1: null, addressLine2: null, postalCode: null, city: null });
    await t.db.update(organizations).set({ stripeCustomerId: 'cus_ORGCUSTOMER1' }).where(eq(organizations.id, orgId));
    await issueForSession(session('cs_live_sameCustomer', { customer: 'cus_ORGCUSTOMER1', email: 'owner@example.com' }));
    expect(await orgOf('cs_live_sameCustomer')).toBe(orgId);
    expect(await orgs()).toHaveLength(1);
  });

  it("someone else's VAT id gives no way into that organization: the buyer gets their own", async () => {
    const victim = await signUp('victim@example.com');
    const victimOrg = await createOrg(t.db, victim, { name: 'Victim AS', orgNumber: '123456789', vatId: null, country: 'NO', addressLine1: null, addressLine2: null, postalCode: null, city: null });
    await issueForSession(session('cs_live_otherVat01', { email: 'attacker@example.com' }));
    const created = await orgOf('cs_live_otherVat01');
    expect(created).not.toBe(victimOrg);
    expect(await orgs()).toHaveLength(2);
    const attacker = await signUp('attacker@example.com');
    await claimPendingOwnership(t.db, attacker.id);
    expect((await listOrgs(t.db, attacker.id)).map((o) => o.id)).toEqual([created]);
    expect(await members(victimOrg)).toEqual([expect.objectContaining({ userId: victim.id })]);
  });
});

describe('bought from the console', () => {
  it('a signed-in buyer with a chosen organization: the license goes there, nothing is created', async () => {
    const me = await signUp('buyer@example.com');
    const orgId = await createOrg(t.db, me, { name: 'Chosen', orgNumber: null, vatId: null, country: null, addressLine1: null, addressLine2: null, postalCode: null, city: null });
    await issueForSession(session('cs_live_fromConsole', { metadata: { org_id: orgId } }));
    expect(await orgOf('cs_live_fromConsole')).toBe(orgId);
    expect(await orgs()).toHaveLength(1);
    expect(await pending()).toEqual([]);
    expect(await members(orgId)).toHaveLength(1);
  });
});

describe('redelivery', () => {
  it('the webhook twice at once, then again after sign-in: one organization, one owner', async () => {
    const s = session('cs_live_redelivered');
    await Promise.all([issueForSession(s), issueForSession(s), issueForSession(s)]);
    expect(await orgs()).toHaveLength(1);
    expect(await pending()).toHaveLength(1);
    const me = await signUp('buyer@example.com');
    await claimPendingOwnership(t.db, me.id);
    await issueForSession(s);
    const [org] = await orgs();
    expect(await orgs()).toHaveLength(1);
    expect(await members(org.id)).toHaveLength(1);
    expect(await pending()).toEqual([]);
    const created = await t.db.select().from(auditLog).where(eq(auditLog.action, 'org.create'));
    expect(created).toHaveLength(1);
  });
});

describe('backfill of older licenses', () => {
  function older(n: number, over: Partial<LicenseRecord> = {}): LicenseRecord {
    return {
      session_id: `cs_live_olderLicense${n}`,
      invoice_number: null,
      email_sha256: emailHash('buyer@example.com'),
      livemode: true,
      dates_from_form: false,
      token: `ATL1.older${n}.sig`,
      payload: { v: 1, kid: 'k', id: `L-olderLicense${n}`, customer: `cus_older${n}xx`, product: 'servers', pack: 'M', max_servers: 20, kind: 'year', issued_at: '2026-09-20T10:00:00Z', updates_until: '2027-09-20' },
      ...over,
    };
  }

  it('asks Stripe once per license, whatever happened, and creates the organization once', async () => {
    await t.db.insert(licenses).values([
      toRow(older(1)),
      toRow(older(2, { livemode: false })),
      toRow(older(3)),
      toRow(older(4)),
      toRow(older(5, { revoked_at: '2026-09-21T00:00:00Z', revoke_reason: 'refunded' })),
    ]);
    const asked: string[] = [];
    let timeouts = 1;
    const retrieve = async (id: string): Promise<CheckoutSessionLike> => {
      asked.push(id);
      if (id === 'cs_live_olderLicense3') throw Object.assign(new Error('No such checkout.session'), { statusCode: 404 });
      if (id === 'cs_live_olderLicense4' && timeouts-- > 0) throw Object.assign(new Error('timeout'), { statusCode: 500 });
      return session(id) as unknown as CheckoutSessionLike;
    };

    const first = await backfillCheckoutOrgs(t.db, { retrieve, stripeLivemode: true });
    // 1: created; 2: test mode, not asked; 3: gone; 4: failed, tried next start; 5: refunded, not considered.
    expect(first).toEqual({ checked: 4, assigned: 1, skipped: 2, failed: 1 });
    expect(asked.sort()).toEqual(['cs_live_olderLicense1', 'cs_live_olderLicense3', 'cs_live_olderLicense4']);
    const [org] = await orgs();
    expect(await orgOf('cs_live_olderLicense1')).toBe(org.id);

    asked.length = 0;
    const second = await backfillCheckoutOrgs(t.db, { retrieve, stripeLivemode: true });
    expect(asked).toEqual(['cs_live_olderLicense4']);
    // Same buyer, same VAT: into the organization the first one made.
    expect(second).toEqual({ checked: 1, assigned: 1, skipped: 0, failed: 0 });
    expect(await orgOf('cs_live_olderLicense4')).toBe(org.id);
    expect(await orgs()).toHaveLength(1);

    asked.length = 0;
    expect(await backfillCheckoutOrgs(t.db, { retrieve, stripeLivemode: true })).toEqual({ checked: 0, assigned: 0, skipped: 0, failed: 0 });
    expect(asked).toEqual([]);
  });

  it('a buyer who already has an organization keeps the claim box for older licenses', async () => {
    const me = await signUp('buyer@example.com');
    await createOrg(t.db, me, { name: 'Mine', orgNumber: null, vatId: null, country: null, addressLine1: null, addressLine2: null, postalCode: null, city: null });
    await t.db.insert(licenses).values(toRow(older(6)));
    const result = await backfillCheckoutOrgs(t.db, { retrieve: async (id) => session(id) as unknown as CheckoutSessionLike, stripeLivemode: true });
    expect(result).toMatchObject({ assigned: 0, skipped: 1 });
    expect(await orgs()).toHaveLength(1);
    expect((await unassignedLicenses(t.db, me)).map((l) => l.session_id)).toEqual(['cs_live_olderLicense6']);
  });

  it('never assigns a license to a session whose email is not the one it was issued to', async () => {
    await t.db.insert(licenses).values(toRow(older(7, { email_sha256: emailHash('someone@example.com') })));
    const result = await backfillCheckoutOrgs(t.db, { retrieve: async (id) => session(id) as unknown as CheckoutSessionLike, stripeLivemode: true });
    expect(result).toMatchObject({ assigned: 0, skipped: 1 });
    expect(await orgs()).toEqual([]);
  });
});
