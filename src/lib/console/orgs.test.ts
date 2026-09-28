import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../db/testing';
import { auditLog, invites, organizations, users } from '../db/schema';
import { emailHash, type LicensePayload } from '../license/format';
import { createLicenseStore, type LicenseRecord } from '../license/store';
import {
  acceptInvite,
  changeRole,
  claimLicense,
  createInvite,
  createOrg,
  getOrg,
  INVITE_TTL_MS,
  inviteByToken,
  invitesForUser,
  licenseIssuedToOrg,
  licensesForOrg,
  listInvites,
  listMembers,
  listOrgs,
  orgForCheckout,
  removeMember,
  revokeInvite,
  unassignedLicenses,
  updateOrg,
  validateOrgInput,
  type ConsoleUser,
  type OrgInput,
} from './orgs';

let t: Awaited<ReturnType<typeof testDb>>;

beforeEach(async () => {
  t = await testDb();
});
afterEach(async () => {
  await t.close();
});

async function user(email: string, verified = true): Promise<ConsoleUser> {
  const [row] = await t.db
    .insert(users)
    .values({ email, name: email.split('@')[0], emailVerified: verified ? new Date() : null })
    .returning();
  return { id: row.id, email: row.email, emailVerified: row.emailVerified, name: row.name, isAdmin: row.isAdmin };
}

const orgInput = (name: string): OrgInput => ({
  name,
  orgNumber: '123 456 789',
  vatId: null,
  country: 'NO',
  addressLine1: 'Street 1',
  addressLine2: null,
  postalCode: '2817',
  city: 'Gjøvik',
});

function license(sessionId: string, email: string, over: Partial<LicenseRecord> = {}, payload: Partial<LicensePayload> = {}): LicenseRecord {
  return {
    session_id: sessionId,
    invoice_number: null,
    email_sha256: emailHash(email),
    livemode: true,
    dates_from_form: false,
    token: `ATL1.${sessionId}.sig`,
    payload: {
      v: 1,
      kid: 'kid',
      id: `L-${sessionId}`,
      customer: 'cus_ABCDEF123',
      product: 'servers',
      pack: 'M',
      max_servers: 20,
      kind: 'year',
      issued_at: '2026-09-28T10:00:00Z',
      updates_until: '2027-09-28',
      ...payload,
    },
    ...over,
  };
}

async function addLicense(record: LicenseRecord) {
  await createLicenseStore(t.db).issueOnce(record.session_id, async () => record);
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  }
};

describe('organization form', () => {
  it('needs a name, a known country and short one-line fields', () => {
    expect(validateOrgInput({ name: ' Example LAN AS ', country: 'no', city: 'Oslo\nX' })).toEqual({
      ok: true,
      value: { name: 'Example LAN AS', orgNumber: null, vatId: null, country: 'NO', addressLine1: null, addressLine2: null, postalCode: null, city: 'Oslo X' },
    });
    const bad = validateOrgInput({ name: '', country: 'XX', vatId: 'x'.repeat(41) });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['country', 'name', 'vatId']);
  });
});

describe('authorization across organizations', () => {
  it('a user only sees and changes organizations they are a member of', async () => {
    const alice = await user('alice@a.example');
    const bob = await user('bob@b.example');
    const orgA = await createOrg(t.db, alice, orgInput('Org A'));
    const orgB = await createOrg(t.db, bob, orgInput('Org B'));
    await addLicense(license('cs_a', 'alice@a.example', { org_id: orgA }));

    expect((await listOrgs(t.db, alice.id)).map((o) => [o.name, o.role])).toEqual([['Org A', 'owner']]);
    expect((await listOrgs(t.db, bob.id)).map((o) => o.name)).toEqual(['Org B']);
    expect(await getOrg(t.db, bob.id, orgA)).toBeNull();
    expect(await getOrg(t.db, bob.id, 'not-a-uuid')).toBeNull();
    expect((await getOrg(t.db, alice.id, orgA))?.role).toBe('owner');

    // Every org-scoped read and write refuses Bob in Org A, as if it didn't exist.
    expect(await code(listMembers(t.db, bob.id, orgA))).toBe('not-found');
    expect(await code(listInvites(t.db, bob.id, orgA))).toBe('not-found');
    expect(await code(licensesForOrg(t.db, bob.id, orgA))).toBe('not-found');
    expect(await code(updateOrg(t.db, bob, orgA, orgInput('Hijacked')))).toBe('not-found');
    expect(await code(createInvite(t.db, bob, orgA, 'eve@x.example', 'owner'))).toBe('not-found');
    expect(await code(changeRole(t.db, bob, orgA, alice.id, 'member'))).toBe('not-found');
    expect(await code(removeMember(t.db, bob, orgA, alice.id))).toBe('not-found');
    const { id: inviteId } = await createInvite(t.db, alice, orgA, 'carol@x.example', 'member');
    expect(await code(revokeInvite(t.db, bob, orgA, inviteId))).toBe('not-found');
    expect(await code(revokeInvite(t.db, bob, orgB, inviteId))).toBe('not-found');

    expect((await licensesForOrg(t.db, alice.id, orgA)).map((l) => l.session_id)).toEqual(['cs_a']);
    expect(await licensesForOrg(t.db, bob.id, orgB)).toEqual([]);
    expect((await getOrg(t.db, alice.id, orgA))?.name).toBe('Org A');
  });

  it('members read, owners and admins manage', async () => {
    const owner = await user('owner@x.example');
    const admin = await user('admin@x.example');
    const member = await user('member@x.example');
    const org = await createOrg(t.db, owner, orgInput('Org'));
    for (const [u, role] of [
      [admin, 'admin'],
      [member, 'member'],
    ] as const) {
      const { token } = await createInvite(t.db, owner, org, u.email!, role);
      await acceptInvite(t.db, u, { token });
    }
    expect((await listMembers(t.db, member.id, org)).map((m) => m.role)).toEqual(['owner', 'admin', 'member']);
    expect(await code(listInvites(t.db, member.id, org))).toBe('forbidden');
    expect(await code(createInvite(t.db, member, org, 'x@x.example', 'member'))).toBe('forbidden');
    expect(await code(changeRole(t.db, member, org, admin.id, 'member'))).toBe('forbidden');
    expect(await code(removeMember(t.db, member, org, admin.id))).toBe('forbidden');
    expect(await code(updateOrg(t.db, member, org, orgInput('Nope')))).toBe('forbidden');

    // Admins manage members and admins, never owners.
    expect(await code(createInvite(t.db, admin, org, 'x@x.example', 'owner'))).toBe('forbidden');
    expect(await code(changeRole(t.db, admin, org, member.id, 'owner'))).toBe('forbidden');
    expect(await code(changeRole(t.db, admin, org, owner.id, 'member'))).toBe('forbidden');
    expect(await code(removeMember(t.db, admin, org, owner.id))).toBe('forbidden');
    expect(await code(changeRole(t.db, admin, org, member.id, 'admin'))).toBe('ok');
    expect(await code(updateOrg(t.db, admin, org, orgInput('Renamed')))).toBe('ok');
    expect((await getOrg(t.db, owner.id, org))?.name).toBe('Renamed');
  });

  it('never removes or demotes the last owner', async () => {
    const owner = await user('owner@x.example');
    const second = await user('second@x.example');
    const org = await createOrg(t.db, owner, orgInput('Org'));
    expect(await code(removeMember(t.db, owner, org, owner.id))).toBe('last-owner');
    expect(await code(changeRole(t.db, owner, org, owner.id, 'admin'))).toBe('last-owner');

    const { token } = await createInvite(t.db, owner, org, second.email!, 'member');
    await acceptInvite(t.db, second, { token });
    await changeRole(t.db, owner, org, second.id, 'owner');
    // Two owners: one may leave. Then the other is the last one again.
    await removeMember(t.db, owner, org, owner.id);
    expect(await listOrgs(t.db, owner.id)).toEqual([]);
    expect(await code(removeMember(t.db, second, org, second.id))).toBe('last-owner');
  });
});

describe('invites', () => {
  it('keeps only a hash of the token, works once, for the invited address only', async () => {
    const owner = await user('owner@x.example');
    const invited = await user('Invited@X.example'.toLowerCase());
    const other = await user('other@x.example');
    const org = await createOrg(t.db, owner, orgInput('Org'));
    const { token } = await createInvite(t.db, owner, org, ' Invited@X.example ', 'admin');

    const stored = await t.db.select().from(invites);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored[0].email).toBe('invited@x.example');
    expect(await inviteByToken(t.db, token)).toMatchObject({ orgName: 'Org', role: 'admin', status: 'pending' });

    expect(await code(acceptInvite(t.db, other, { token }))).toBe('wrong-email');
    expect(await code(acceptInvite(t.db, await user('unverified@x.example', false), { token }))).toBe('unverified');
    expect(await acceptInvite(t.db, invited, { token })).toBe(org);
    expect((await getOrg(t.db, invited.id, org))?.role).toBe('admin');
    expect(await code(acceptInvite(t.db, invited, { token }))).toBe('not-found');
    expect((await inviteByToken(t.db, token))?.status).toBe('used');
    expect(await inviteByToken(t.db, 'A'.repeat(43))).toBeNull();
  });

  it('expires after 7 days; a new invite or a revoke ends the old one', async () => {
    const owner = await user('owner@x.example');
    const invited = await user('invited@x.example');
    const org = await createOrg(t.db, owner, orgInput('Org'));
    const start = new Date('2026-09-28T10:00:00Z');
    const first = await createInvite(t.db, owner, org, invited.email!, 'member', start);
    const later = new Date(start.getTime() + INVITE_TTL_MS + 1);
    expect((await inviteByToken(t.db, first.token, later))?.status).toBe('expired');
    expect(await code(acceptInvite(t.db, invited, { token: first.token }, later))).toBe('not-found');

    const second = await createInvite(t.db, owner, org, invited.email!, 'member');
    expect(await code(acceptInvite(t.db, invited, { token: first.token }))).toBe('not-found');
    expect((await listInvites(t.db, owner.id, org)).map((i) => i.id)).toEqual([second.id]);
    expect((await invitesForUser(t.db, invited)).map((i) => i.orgName)).toEqual(['Org']);
    await revokeInvite(t.db, owner, org, second.id);
    expect(await code(acceptInvite(t.db, invited, { id: second.id }))).toBe('not-found');
    expect(await invitesForUser(t.db, invited)).toEqual([]);
  });

  it('refuses members and bad addresses', async () => {
    const owner = await user('owner@x.example');
    const org = await createOrg(t.db, owner, orgInput('Org'));
    expect(await code(createInvite(t.db, owner, org, 'owner@x.example', 'member'))).toBe('already-member');
    expect(await code(createInvite(t.db, owner, org, 'not an email', 'member'))).toBe('invalid');
    expect(await code(createInvite(t.db, owner, org, 'x@x.example', 'boss' as never))).toBe('invalid');
  });
});

describe('licenses bought with your email', () => {
  it('lists unassigned licenses for the verified email and adds them to your own organization only', async () => {
    const alice = await user('alice@a.example');
    const bob = await user('bob@b.example');
    const orgA = await createOrg(t.db, alice, orgInput('Org A'));
    const orgB = await createOrg(t.db, bob, orgInput('Org B'));
    await addLicense(license('cs_1', 'Alice@A.example'));
    await addLicense(license('cs_2', 'alice@a.example', {}, { customer: 'cus_SECOND1' }));
    await addLicense(license('cs_bob', 'bob@b.example'));

    expect((await unassignedLicenses(t.db, alice)).map((l) => l.session_id).sort()).toEqual(['cs_1', 'cs_2']);
    expect(await unassignedLicenses(t.db, { ...alice, emailVerified: null })).toEqual([]);

    // Not into someone else's organization, and not someone else's license.
    expect(await code(claimLicense(t.db, alice, orgB, 'cs_1', true))).toBe('not-found');
    expect(await code(claimLicense(t.db, alice, orgA, 'cs_bob', true))).toBe('not-found');
    expect(await code(claimLicense(t.db, { ...alice, emailVerified: null }, orgA, 'cs_1', true))).toBe('unverified');

    await claimLicense(t.db, alice, orgA, 'cs_1', true);
    expect(await code(claimLicense(t.db, alice, orgA, 'cs_1', true))).toBe('not-found');
    await claimLicense(t.db, alice, orgA, 'cs_2', true);
    expect(await unassignedLicenses(t.db, alice)).toEqual([]);
    expect((await licensesForOrg(t.db, alice.id, orgA)).map((l) => l.session_id).sort()).toEqual(['cs_1', 'cs_2']);
    // The first license's Stripe customer becomes the org's; the second doesn't replace it.
    expect((await getOrg(t.db, alice.id, orgA))?.stripeCustomerId).toBe('cus_ABCDEF123');
  });

  it('takes the Stripe customer only from a license in the same mode as the Stripe key', async () => {
    const alice = await user('alice@a.example');
    const org = await createOrg(t.db, alice, orgInput('Org A'));
    await addLicense(license('cs_test_1', 'alice@a.example', { livemode: false }));
    await claimLicense(t.db, alice, org, 'cs_test_1', true);
    expect((await getOrg(t.db, alice.id, org))?.stripeCustomerId).toBeNull();
  });

  it('checkout from the console issues the license into the organization', async () => {
    const alice = await user('alice@a.example');
    const org = await createOrg(t.db, alice, orgInput('Org A'));
    expect(await orgForCheckout(t.db, org)).toBe(org);
    expect(await orgForCheckout(t.db, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await orgForCheckout(t.db, 'x')).toBeNull();
    const record = license('cs_live_x', 'alice@a.example', { org_id: org });
    await addLicense(record);
    await licenseIssuedToOrg(t.db, record, true);
    expect((await licensesForOrg(t.db, alice.id, org)).map((l) => l.session_id)).toEqual(['cs_live_x']);
    expect((await t.db.select().from(organizations).where(eq(organizations.id, org)))[0].stripeCustomerId).toBe('cus_ABCDEF123');
  });
});

describe('audit log', () => {
  it('records every write, without tokens', async () => {
    const owner = await user('owner@x.example');
    const invited = await user('invited@x.example');
    const org = await createOrg(t.db, owner, orgInput('Org'));
    await updateOrg(t.db, owner, org, { ...orgInput('Org'), city: 'Oslo' });
    const { token } = await createInvite(t.db, owner, org, invited.email!, 'member');
    await acceptInvite(t.db, invited, { token });
    await changeRole(t.db, owner, org, invited.id, 'admin');
    await removeMember(t.db, owner, org, invited.id);
    await addLicense(license('cs_1', 'owner@x.example'));
    await claimLicense(t.db, owner, org, 'cs_1', true);

    const rows = await t.db.select().from(auditLog).orderBy(auditLog.id);
    expect(rows.map((r) => r.action)).toEqual([
      'org.create',
      'org.update',
      'invite.create',
      'invite.accept',
      'member.role',
      'member.remove',
      'license.claim',
      'org.stripe_customer',
    ]);
    expect(rows[1].details).toEqual({ changed: ['city'] });
    expect(rows.every((r) => r.orgId === org)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe('retention', () => {
  it('prunes expired sessions, links, old invites and old log entries', async () => {
    const { pruneExpired } = await import('../db/prune');
    const { sessions, verificationTokens } = await import('../db/schema');
    const owner = await user('owner@x.example');
    const org = await createOrg(t.db, owner, orgInput('Org'));
    const now = new Date('2026-09-28T10:00:00Z');
    await t.db.insert(sessions).values([
      { sessionToken: 'old', userId: owner.id, expires: new Date('2026-09-01') },
      { sessionToken: 'live', userId: owner.id, expires: new Date('2026-10-20') },
    ]);
    await t.db.insert(verificationTokens).values({ identifier: 'a@x.example', token: 'h', expires: new Date('2026-09-28T09:00:00Z') });
    await createInvite(t.db, owner, org, 'old@x.example', 'member', new Date('2026-08-01'));
    await createInvite(t.db, owner, org, 'new@x.example', 'member', new Date('2026-09-27'));
    await t.db.insert(auditLog).values({ action: 'old', at: new Date('2024-01-01') });
    expect(await pruneExpired(t.db, now)).toEqual({ sessions: 1, signInLinks: 1, invites: 1, auditLog: 1, leads: 0, refundRequests: 0 });
    expect((await t.db.select().from(invites)).map((i) => i.email)).toEqual(['new@x.example']);
  });
});
