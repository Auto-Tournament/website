import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { invites, licenses, memberships, organizations, ROLES, users, type Role } from '../db/schema';
import { emailHash } from '../license/format';
import { fromRow, type LicenseRecord } from '../license/store';
import { audit, type Tx } from './audit';
import { isCountryCode } from './countries';

/**
 * Organizations, members, invites and license assignment for the console.
 *
 * Every function that reads or writes an organization takes the signed-in
 * user and checks their membership in the same query or transaction: a user
 * only ever sees organizations they belong to. Every write is recorded in
 * audit_log in the same transaction.
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */

export type ConsoleUser = {
  id: string;
  email: string | null;
  emailVerified: Date | null;
  name: string | null;
  isAdmin: boolean;
};

export type ConsoleErrorCode = 'not-found' | 'forbidden' | 'invalid' | 'last-owner' | 'already-member' | 'wrong-email' | 'unverified';

export class ConsoleError extends Error {
  constructor(
    readonly code: ConsoleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConsoleError';
  }
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

export const canManage = (role: Role) => role === 'owner' || role === 'admin';
export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** The user's email, when it has been verified (an email link was used, or Google said so). */
export function verifiedEmail(user: ConsoleUser): string | null {
  return user.emailVerified && user.email ? user.email.trim().toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Organization details

export type OrgInput = {
  name: string;
  orgNumber: string | null;
  vatId: string | null;
  country: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
};

export type OrgInputResult = { ok: true; value: OrgInput } | { ok: false; errors: Partial<Record<keyof OrgInput, string>> };

const oneLine = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return s ? s.slice(0, max + 1) : null;
};

/** Checks the organization form: a name is required, everything else is optional and one line. */
export function validateOrgInput(raw: Record<string, unknown>): OrgInputResult {
  const errors: Partial<Record<keyof OrgInput, string>> = {};
  const field = (key: keyof OrgInput, max: number) => {
    const v = oneLine(raw[key], max);
    if (v && v.length > max) errors[key] = `At most ${max} characters.`;
    return v;
  };
  const name = field('name', 120);
  if (!name) errors.name = 'Enter the organization name.';
  const country = field('country', 2)?.toUpperCase() ?? null;
  if (country && !isCountryCode(country)) errors.country = 'Choose a country.';
  const value: OrgInput = {
    name: name ?? '',
    orgNumber: field('orgNumber', 40),
    vatId: field('vatId', 40),
    country,
    addressLine1: field('addressLine1', 200),
    addressLine2: field('addressLine2', 200),
    postalCode: field('postalCode', 20),
    city: field('city', 100),
  };
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

export type Org = typeof organizations.$inferSelect;
export type OrgSummary = { id: string; name: string; role: Role };

/** The organizations the user belongs to, by name. */
export async function listOrgs(db: Db, userId: string): Promise<OrgSummary[]> {
  return db
    .select({ id: organizations.id, name: organizations.name, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(organizations.name), asc(organizations.createdAt));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** The organization with the user's role in it, or null when there is none or the user isn't a member. */
export async function getOrg(db: Db | Tx, userId: string, orgId: string): Promise<(Org & { role: Role }) | null> {
  if (!isUuid(orgId)) return null;
  const [row] = await db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  return row ? { ...row.org, role: row.role } : null;
}

/** Like getOrg, but throws; with `manage`, only for owners and admins. */
async function requireOrg(db: Db | Tx, userId: string, orgId: string, options: { manage?: boolean } = {}) {
  const org = await getOrg(db, userId, orgId);
  if (!org) throw new ConsoleError('not-found', 'No such organization.');
  if (options.manage && !canManage(org.role)) throw new ConsoleError('forbidden', 'Only owners and admins can do that.');
  return org;
}

export async function createOrg(db: Db, user: ConsoleUser, input: OrgInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values(input).returning({ id: organizations.id });
    await tx.insert(memberships).values({ orgId: org.id, userId: user.id, role: 'owner' });
    await audit(tx, { actor: user.id, action: 'org.create', orgId: org.id, targetType: 'organization', targetId: org.id, details: { name: input.name } });
    return org.id;
  });
}

export async function updateOrg(db: Db, user: ConsoleUser, orgId: string, input: OrgInput): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await requireOrg(tx, user.id, orgId, { manage: true });
    await tx.update(organizations).set(input).where(eq(organizations.id, orgId));
    const changed = (Object.keys(input) as (keyof OrgInput)[]).filter((k) => before[k] !== input[k]);
    await audit(tx, { actor: user.id, action: 'org.update', orgId, targetType: 'organization', targetId: orgId, details: { changed } });
  });
}

// ---------------------------------------------------------------------------
// Members

export type Member = { userId: string; name: string | null; email: string | null; role: Role; since: Date };

export async function listMembers(db: Db, userId: string, orgId: string): Promise<Member[]> {
  await requireOrg(db, userId, orgId);
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, since: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(memberships.createdAt));
}

/** Locks the organization's row for the rest of the transaction, so two changes to its owners can't race past the last-owner check. */
async function lockOrg(tx: Tx, orgId: string) {
  await tx.execute(sql`select id from ${organizations} where ${organizations.id} = ${orgId} for update`);
}

async function ownerCount(tx: Tx, orgId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner')));
  return Number(row?.n ?? 0);
}

/**
 * Changes a member's role. Owners and admins manage members; only an owner
 * can make someone an owner or change an owner's role. The last owner can't
 * be demoted.
 */
export async function changeRole(db: Db, user: ConsoleUser, orgId: string, targetUserId: string, role: Role): Promise<void> {
  if (!isRole(role)) throw new ConsoleError('invalid', 'Unknown role.');
  await db.transaction(async (tx) => {
    const org = await requireOrg(tx, user.id, orgId, { manage: true });
    await lockOrg(tx, orgId);
    const [target] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, targetUserId)))
      .limit(1);
    if (!target) throw new ConsoleError('not-found', 'No such member.');
    if (target.role === role) return;
    if ((role === 'owner' || target.role === 'owner') && org.role !== 'owner') throw new ConsoleError('forbidden', 'Only an owner can change who is an owner.');
    if (target.role === 'owner' && (await ownerCount(tx, orgId)) <= 1) throw new ConsoleError('last-owner', 'An organization needs at least one owner. Make someone else an owner first.');
    await tx.update(memberships).set({ role }).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, targetUserId)));
    await audit(tx, { actor: user.id, action: 'member.role', orgId, targetType: 'user', targetId: targetUserId, details: { from: target.role, to: role } });
  });
}

/** Removes a member (or, for yourself, leaves). Removing an owner takes an owner; the last owner can't go. */
export async function removeMember(db: Db, user: ConsoleUser, orgId: string, targetUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const self = targetUserId === user.id;
    const org = await requireOrg(tx, user.id, orgId, { manage: !self });
    await lockOrg(tx, orgId);
    const [target] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, targetUserId)))
      .limit(1);
    if (!target) throw new ConsoleError('not-found', 'No such member.');
    if (target.role === 'owner' && !self && org.role !== 'owner') throw new ConsoleError('forbidden', 'Only an owner can remove an owner.');
    if (target.role === 'owner' && (await ownerCount(tx, orgId)) <= 1) throw new ConsoleError('last-owner', 'An organization needs at least one owner. Make someone else an owner first.');
    await tx.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, targetUserId)));
    await audit(tx, { actor: user.id, action: self ? 'member.leave' : 'member.remove', orgId, targetType: 'user', targetId: targetUserId, details: { role: target.role } });
  });
}

// ---------------------------------------------------------------------------
// Invites

export type PendingInvite = { id: string; email: string; role: Role; expiresAt: Date; createdAt: Date };

/** Pending invites of an organization, for its owners and admins. */
export async function listInvites(db: Db, userId: string, orgId: string, now = new Date()): Promise<PendingInvite[]> {
  await requireOrg(db, userId, orgId, { manage: true });
  return db
    .select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites)
    .where(and(eq(invites.orgId, orgId), isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now)))
    .orderBy(desc(invites.createdAt));
}

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * Invites `email` to the organization. Returns the link token (only its hash is
 * kept); the caller emails it. An earlier pending invite for the same address
 * is replaced. Admins can't invite owners.
 */
export async function createInvite(
  db: Db,
  user: ConsoleUser,
  orgId: string,
  rawEmail: string,
  role: Role,
  now = new Date(),
): Promise<{ id: string; token: string; email: string; orgName: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new ConsoleError('invalid', 'Enter a valid email address.');
  if (!isRole(role)) throw new ConsoleError('invalid', 'Unknown role.');
  return db.transaction(async (tx) => {
    const org = await requireOrg(tx, user.id, orgId, { manage: true });
    if (role === 'owner' && org.role !== 'owner') throw new ConsoleError('forbidden', 'Only an owner can invite an owner.');
    const [existing] = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, orgId), eq(users.email, email)))
      .limit(1);
    if (existing) throw new ConsoleError('already-member', 'That person is already a member.');
    await tx
      .update(invites)
      .set({ revokedAt: now })
      .where(and(eq(invites.orgId, orgId), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.revokedAt)));
    const token = randomBytes(32).toString('base64url');
    const [invite] = await tx
      .insert(invites)
      .values({ orgId, email, role, tokenHash: sha256(token), invitedBy: user.id, expiresAt: new Date(now.getTime() + INVITE_TTL_MS), createdAt: now })
      .returning({ id: invites.id });
    await audit(tx, { actor: user.id, action: 'invite.create', orgId, targetType: 'invite', targetId: invite.id, details: { role } });
    return { id: invite.id, token, email, orgName: org.name };
  });
}

export async function revokeInvite(db: Db, user: ConsoleUser, orgId: string, inviteId: string, now = new Date()): Promise<void> {
  if (!isUuid(inviteId)) throw new ConsoleError('not-found', 'No such invite.');
  await db.transaction(async (tx) => {
    await requireOrg(tx, user.id, orgId, { manage: true });
    const rows = await tx
      .update(invites)
      .set({ revokedAt: now })
      .where(and(eq(invites.id, inviteId), eq(invites.orgId, orgId), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
      .returning({ id: invites.id });
    if (rows.length === 0) throw new ConsoleError('not-found', 'No such invite.');
    await audit(tx, { actor: user.id, action: 'invite.revoke', orgId, targetType: 'invite', targetId: inviteId });
  });
}

export const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type InviteView = { id: string; orgName: string; role: Role; email: string; status: 'pending' | 'expired' | 'used' };

/** What an invite link points at, for its page. Null for an unknown token. */
export async function inviteByToken(db: Db, token: string, now = new Date()): Promise<InviteView | null> {
  if (!INVITE_TOKEN.test(token)) return null;
  const [row] = await db
    .select({ invite: invites, orgName: organizations.name })
    .from(invites)
    .innerJoin(organizations, eq(organizations.id, invites.orgId))
    .where(eq(invites.tokenHash, sha256(token)))
    .limit(1);
  if (!row) return null;
  const { invite } = row;
  const status = invite.acceptedAt || invite.revokedAt ? 'used' : invite.expiresAt <= now ? 'expired' : 'pending';
  return { id: invite.id, orgName: row.orgName, role: invite.role, email: invite.email, status };
}

/** Pending invites for the user's verified email, with the organization names. */
export async function invitesForUser(db: Db, user: ConsoleUser, now = new Date()): Promise<{ id: string; orgName: string; role: Role }[]> {
  const email = verifiedEmail(user);
  if (!email) return [];
  return db
    .select({ id: invites.id, orgName: organizations.name, role: invites.role })
    .from(invites)
    .innerJoin(organizations, eq(organizations.id, invites.orgId))
    .where(and(eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now)))
    .orderBy(asc(organizations.name));
}

/**
 * Accepts an invite, by its link token or (from the pending list) its id. Only
 * for the address it was sent to, once verified; once; before it expires.
 * Returns the organization id.
 */
export async function acceptInvite(db: Db, user: ConsoleUser, by: { token: string } | { id: string }, now = new Date()): Promise<string> {
  const email = verifiedEmail(user);
  if (!email) throw new ConsoleError('unverified', 'Sign in with the invited email address first.');
  if ('token' in by ? !INVITE_TOKEN.test(by.token) : !isUuid(by.id)) throw new ConsoleError('not-found', 'This invite is not valid.');
  const match = 'token' in by ? eq(invites.tokenHash, sha256(by.token)) : eq(invites.id, by.id);
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(invites).where(match).limit(1);
    if (!invite) throw new ConsoleError('not-found', 'This invite is not valid.');
    if (invite.email !== email) throw new ConsoleError('wrong-email', 'This invite is for another email address. Sign in with that address to accept it.');
    // Single use: the update only matches a pending invite.
    const used = await tx
      .update(invites)
      .set({ acceptedAt: now, acceptedBy: user.id })
      .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now)))
      .returning({ id: invites.id });
    if (used.length === 0) throw new ConsoleError('not-found', 'This invite has expired or was already used. Ask for a new one.');
    await tx.insert(memberships).values({ orgId: invite.orgId, userId: user.id, role: invite.role }).onConflictDoNothing();
    await audit(tx, { actor: user.id, action: 'invite.accept', orgId: invite.orgId, targetType: 'invite', targetId: invite.id, details: { role: invite.role } });
    return invite.orgId;
  });
}

// ---------------------------------------------------------------------------
// Licenses

export async function licensesForOrg(db: Db, userId: string, orgId: string): Promise<LicenseRecord[]> {
  await requireOrg(db, userId, orgId);
  const rows = await db.select().from(licenses).where(eq(licenses.orgId, orgId)).orderBy(desc(licenses.issuedAt));
  return rows.map(fromRow);
}

/** Licenses bought with the user's verified email that aren't in any organization yet. */
export async function unassignedLicenses(db: Db, user: ConsoleUser): Promise<LicenseRecord[]> {
  const email = verifiedEmail(user);
  if (!email) return [];
  const rows = await db
    .select()
    .from(licenses)
    .where(and(eq(licenses.emailHash, emailHash(email)), isNull(licenses.orgId)))
    .orderBy(desc(licenses.issuedAt));
  return rows.map(fromRow);
}

/** A Stripe customer id from a license, when it is one (the payload has the email instead when Stripe had none). */
export function stripeCustomerOf(record: Pick<LicenseRecord, 'payload'>): string | null {
  const c = record.payload.customer;
  return typeof c === 'string' && /^cus_[A-Za-z0-9]{6,64}$/.test(c) ? c : null;
}

/** Sets the organization's Stripe customer from a license, only when it has none yet and the license is in the mode the site's Stripe key uses. */
async function adoptStripeCustomer(tx: Tx, orgId: string, record: LicenseRecord, stripeLivemode: boolean, actor: string | null): Promise<void> {
  const customer = stripeCustomerOf(record);
  if (!customer || record.livemode !== stripeLivemode) return;
  const rows = await tx
    .update(organizations)
    .set({ stripeCustomerId: customer })
    .where(and(eq(organizations.id, orgId), isNull(organizations.stripeCustomerId)))
    .returning({ id: organizations.id });
  if (rows.length > 0) await audit(tx, { actor, action: 'org.stripe_customer', orgId, targetType: 'organization', targetId: orgId, details: { from_license: record.payload.id } });
}

/**
 * Adds a license bought with the user's verified email to one of the user's
 * organizations. Only an unassigned license, only with a matching email hash.
 */
export async function claimLicense(db: Db, user: ConsoleUser, orgId: string, sessionId: string, stripeLivemode: boolean): Promise<void> {
  const email = verifiedEmail(user);
  if (!email) throw new ConsoleError('unverified', 'Your email address is not verified.');
  await db.transaction(async (tx) => {
    await requireOrg(tx, user.id, orgId);
    const [row] = await tx
      .update(licenses)
      .set({ orgId })
      .where(and(eq(licenses.sessionId, sessionId), isNull(licenses.orgId), eq(licenses.emailHash, emailHash(email))))
      .returning();
    if (!row) throw new ConsoleError('not-found', 'That license is not available to add.');
    const record = fromRow(row);
    await audit(tx, { actor: user.id, action: 'license.claim', orgId, targetType: 'license', targetId: record.payload.id });
    await adoptStripeCustomer(tx, orgId, record, stripeLivemode, user.id);
  });
}

/**
 * The organization a paid checkout from the console is for (metadata.org_id),
 * when it still exists. Used when the license is issued.
 */
export async function orgForCheckout(db: Db, orgId: unknown): Promise<string | null> {
  if (!isUuid(orgId)) return null;
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return row?.id ?? null;
}

/** After a license was issued into an organization by checkout: record it, and take the Stripe customer if the org has none. */
export async function licenseIssuedToOrg(db: Db, record: LicenseRecord, stripeLivemode: boolean): Promise<void> {
  const orgId = record.org_id;
  if (!orgId) return;
  await db.transaction(async (tx) => {
    await audit(tx, { actor: null, action: 'license.issue', orgId, targetType: 'license', targetId: record.payload.id, details: { via: 'checkout' } });
    await adoptStripeCustomer(tx, orgId, record, stripeLivemode, null);
  });
}
