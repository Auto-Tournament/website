/**
 * Admin passkeys: a fresh Touch ID / Face ID / security-key check for the
 * admin CRM, on top of the console sign-in.
 *
 * - Adding a passkey needs a link emailed to the admin's own verified address
 *   (single use, 15 minutes, token stored as SHA-256), so a stolen console
 *   session alone can't add one. With a passkey already, adding another also
 *   needs this session to have passed the passkey check.
 * - Recovery (all passkeys lost): the same email link, but the new passkey
 *   works only 24 hours later, and a warning is emailed at once. A hijacked
 *   inbox alone gives no instant access.
 * - The gate: an admin without a passkey sees only "Set up a passkey"; each
 *   session passes a passkey check once, valid 12 hours.
 * - Approvals: sensitive actions need a fresh assertion (user verification
 *   required) against a server challenge bound to that action and target,
 *   2 minutes, single use; the signature counter must move forward.
 *
 * Audit entries for every link, registration, removal and approval; never
 * credential data. Relative imports on purpose: the tests run these against PGlite.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, gt, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { adminPasskeyLinks, adminPasskeys, adminSessionChecks, sessions, webauthnChallenges, type PasskeyLinkPurpose } from '../db/schema';
import { audit } from '../console/audit';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON, RelyingParty, Verifier } from './webauthn';

export class PasskeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasskeyError';
  }
}

export const LINK_TTL_MS = 15 * 60_000;
export const APPROVAL_TTL_MS = 2 * 60_000;
export const REGISTRATION_TTL_MS = 5 * 60_000;
export const SESSION_CHECK_TTL_MS = 12 * 60 * 60_000;
export const RECOVERY_DELAY_MS = 24 * 60 * 60_000;
export const PASSKEY_TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** The approval that opens /admin for a session. */
export const SESSION_ACTION = 'admin.session';

/** Actions that need a passkey approval, with the words the page shows. */
export const APPROVAL_ACTIONS = {
  'admin.session': 'Open the admin console',
  'refund.confirm': 'Confirm a refund',
  'license.reissue': 'Reissue a license',
  'license.revoke': 'Mark a license refunded or revoked',
  'license.create': 'Create a manual license',
  'order.paid': 'Mark an order paid',
  'export.sales': 'Export sales',
  'passkey.remove': 'Remove a passkey',
} as const;
export type ApprovalAction = keyof typeof APPROVAL_ACTIONS;
export const isApprovalAction = (v: unknown): v is ApprovalAction => typeof v === 'string' && Object.hasOwn(APPROVAL_ACTIONS, v);

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

export type Passkey = typeof adminPasskeys.$inferSelect;
type User = { id: string; email: string | null };

// ---------------------------------------------------------------------------
// Reading

export async function passkeysOf(db: Db, userId: string): Promise<Passkey[]> {
  return db.select().from(adminPasskeys).where(eq(adminPasskeys.userId, userId)).orderBy(asc(adminPasskeys.createdAt));
}

export const isUsable = (p: Pick<Passkey, 'usableFrom'>, now = new Date()) => p.usableFrom.getTime() <= now.getTime();

export async function usablePasskeys(db: Db, userId: string, now = new Date()): Promise<Passkey[]> {
  return db
    .select()
    .from(adminPasskeys)
    .where(and(eq(adminPasskeys.userId, userId), lte(adminPasskeys.usableFrom, now)));
}

/** Whether this session passed the passkey check in the last 12 hours. */
export async function sessionVerified(db: Db, userId: string, sessionHash: string | null, now = new Date()): Promise<boolean> {
  if (!sessionHash) return false;
  const [row] = await db
    .select({ at: adminSessionChecks.verifiedAt })
    .from(adminSessionChecks)
    .innerJoin(sessions, eq(sessions.sessionToken, adminSessionChecks.sessionHash))
    .where(and(eq(adminSessionChecks.sessionHash, sessionHash), eq(adminSessionChecks.userId, userId), eq(sessions.userId, userId), gt(adminSessionChecks.verifiedAt, new Date(now.getTime() - SESSION_CHECK_TTL_MS))))
    .limit(1);
  return Boolean(row);
}

export type Gate = 'setup' | 'verify' | 'ok';

/** What /admin shows this admin: set up a passkey, check it for this session, or the admin console. */
export async function adminGate(db: Db, userId: string, sessionHash: string | null, now = new Date()): Promise<Gate> {
  if ((await usablePasskeys(db, userId, now)).length === 0) return 'setup';
  return (await sessionVerified(db, userId, sessionHash, now)) ? 'ok' : 'verify';
}

// ---------------------------------------------------------------------------
// Email links for adding a passkey

/**
 * A link for adding a passkey. 'register': the first passkey, or another one
 * from a session that passed the passkey check. 'recover': all passkeys lost;
 * the passkey it adds waits 24 hours. Older unused links of the user are
 * closed. Returns the token for the email.
 */
export async function createPasskeyLink(db: Db, user: User, purpose: PasskeyLinkPurpose, opts: { sessionVerified: boolean }, now = new Date()): Promise<string> {
  if (purpose === 'register' && !opts.sessionVerified && (await usablePasskeys(db, user.id, now)).length > 0) {
    throw new PasskeyError('Check your passkey for this session first, or use recovery if you lost it.');
  }
  const token = randomBytes(32).toString('base64url');
  await db.transaction(async (tx) => {
    await tx
      .update(adminPasskeyLinks)
      .set({ usedAt: now })
      .where(and(eq(adminPasskeyLinks.userId, user.id), isNull(adminPasskeyLinks.usedAt)));
    const [link] = await tx
      .insert(adminPasskeyLinks)
      .values({ userId: user.id, purpose, tokenHash: sha256(token), createdAt: now, expiresAt: new Date(now.getTime() + LINK_TTL_MS) })
      .returning({ id: adminPasskeyLinks.id });
    await audit(tx, { actor: user.id, action: 'admin.passkey_link', targetType: 'user', targetId: user.id, details: { link: link.id, purpose } });
  });
  return token;
}

export type PasskeyLink = typeof adminPasskeyLinks.$inferSelect;

export async function linkByToken(db: Db, token: string): Promise<PasskeyLink | null> {
  if (!PASSKEY_TOKEN.test(token)) return null;
  const hash = sha256(token);
  const [row] = await db.select().from(adminPasskeyLinks).where(eq(adminPasskeyLinks.tokenHash, hash)).limit(1);
  if (!row) return null;
  const a = Buffer.from(row.tokenHash);
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b) ? row : null;
}

/** A link this user may register with now, or a PasskeyError saying why not. */
async function usableLink(db: Db, user: User, token: string, sessionOk: boolean, now: Date): Promise<PasskeyLink> {
  const link = await linkByToken(db, token);
  if (!link || link.userId !== user.id) throw new PasskeyError('This link isn’t valid for the account you are signed in with.');
  if (link.usedAt) throw new PasskeyError('This link was already used. Ask for a new one.');
  if (link.expiresAt.getTime() <= now.getTime()) throw new PasskeyError('This link has expired. Ask for a new one.');
  if (link.purpose === 'register' && !sessionOk && (await usablePasskeys(db, user.id, now)).length > 0) {
    throw new PasskeyError('You already have a passkey: check it on the admin page first, then open this link again.');
  }
  return link;
}

/** The browser's registration options for a link, with a fresh challenge bound to it. */
export async function registrationOptions(
  db: Db,
  user: User,
  token: string,
  deps: { verifier: Verifier; rp: RelyingParty; sessionVerified: boolean; now?: Date },
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const now = deps.now ?? new Date();
  const link = await usableLink(db, user, token, deps.sessionVerified, now);
  const existing = await passkeysOf(db, user.id);
  const options = await deps.verifier.registrationOptions({
    rp: deps.rp,
    userId: user.id,
    userName: user.email ?? user.id,
    exclude: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
  });
  await db.insert(webauthnChallenges).values({
    userId: user.id,
    challenge: options.challenge,
    purpose: 'register',
    action: 'passkey.register',
    target: link.id,
    createdAt: now,
    expiresAt: new Date(now.getTime() + REGISTRATION_TTL_MS),
  });
  return options;
}

/** The challenge in a WebAuthn response's clientDataJSON (base64url JSON), or null. */
export function challengeOf(response: { response?: { clientDataJSON?: unknown } }): string | null {
  const raw = response?.response?.clientDataJSON;
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const data = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { challenge?: unknown };
    return typeof data.challenge === 'string' && data.challenge.length <= 256 ? data.challenge : null;
  } catch {
    return null;
  }
}

/** Parses the JSON a browser sent (capped); null when it isn't an object with an id. */
export function parseCredentialJson<T extends { id: string }>(raw: unknown): T | null {
  if (typeof raw !== 'string' || raw.length > 16_384) return null;
  try {
    const v = JSON.parse(raw) as T;
    return v && typeof v === 'object' && typeof v.id === 'string' && v.id.length <= 1024 ? v : null;
  } catch {
    return null;
  }
}

export type Registered = { passkey: Passkey; recovery: boolean };

/**
 * Finishes adding a passkey: the link and its challenge are used up in the
 * same transaction that stores the passkey. A recovery passkey works from 24
 * hours later.
 */
export async function completeRegistration(
  db: Db,
  user: User,
  token: string,
  input: { name: string; response: RegistrationResponseJSON },
  deps: { verifier: Verifier; rp: RelyingParty; sessionVerified: boolean; now?: Date },
): Promise<Registered> {
  const now = deps.now ?? new Date();
  const link = await usableLink(db, user, token, deps.sessionVerified, now);
  const name = input.name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 60) || 'Passkey';
  const challenge = challengeOf(input.response);
  if (!challenge) throw new PasskeyError('The passkey response is not valid. Try again.');
  const [ch] = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.challenge, challenge)).limit(1);
  if (!ch || ch.userId !== user.id || ch.purpose !== 'register' || ch.target !== link.id || ch.usedAt || ch.expiresAt.getTime() <= now.getTime()) {
    throw new PasskeyError('This passkey request has expired or was already used. Start again.');
  }
  const result = await deps.verifier.verifyRegistration({ rp: deps.rp, response: input.response, challenge: ch.challenge }).catch(() => ({ verified: false as const }));
  if (!result.verified) throw new PasskeyError('The passkey could not be verified. Try again.');
  const recovery = link.purpose === 'recover';
  const usableFrom = recovery ? new Date(now.getTime() + RECOVERY_DELAY_MS) : now;
  return db.transaction(async (tx) => {
    const [usedChallenge] = await tx
      .update(webauthnChallenges)
      .set({ usedAt: now })
      .where(and(eq(webauthnChallenges.id, ch.id), isNull(webauthnChallenges.usedAt)))
      .returning({ id: webauthnChallenges.id });
    const [usedLink] = await tx
      .update(adminPasskeyLinks)
      .set({ usedAt: now })
      .where(and(eq(adminPasskeyLinks.id, link.id), isNull(adminPasskeyLinks.usedAt), gt(adminPasskeyLinks.expiresAt, now)))
      .returning({ id: adminPasskeyLinks.id });
    if (!usedChallenge || !usedLink) throw new PasskeyError('This link was already used. Ask for a new one.');
    const [taken] = await tx.select({ id: adminPasskeys.id }).from(adminPasskeys).where(eq(adminPasskeys.credentialId, result.credential.id)).limit(1);
    if (taken) throw new PasskeyError('This passkey is already registered.');
    const [passkey] = await tx
      .insert(adminPasskeys)
      .values({
        userId: user.id,
        credentialId: result.credential.id,
        publicKey: b64(result.credential.publicKey),
        counter: result.credential.counter,
        transports: result.credential.transports.slice(0, 8),
        name,
        createdAt: now,
        usableFrom,
      })
      .returning();
    await audit(tx, {
      actor: user.id,
      action: recovery ? 'admin.passkey_recover' : 'admin.passkey_register',
      targetType: 'user',
      targetId: user.id,
      details: { passkey: passkey.id, name, usable_from: usableFrom.toISOString() },
    });
    return { passkey, recovery };
  });
}

// ---------------------------------------------------------------------------
// Approvals

/** Options for a passkey check of `action` on `target`, with a fresh 2-minute challenge bound to both. */
export async function approvalOptions(
  db: Db,
  user: User,
  action: ApprovalAction,
  target: string,
  deps: { verifier: Verifier; rp: RelyingParty; now?: Date },
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const now = deps.now ?? new Date();
  const keys = await usablePasskeys(db, user.id, now);
  if (keys.length === 0) throw new PasskeyError('Set up a passkey first.');
  const options = await deps.verifier.authenticationOptions({ rp: deps.rp, allow: keys.map((k) => ({ id: k.credentialId, transports: k.transports })) });
  await db.insert(webauthnChallenges).values({
    userId: user.id,
    challenge: options.challenge,
    purpose: 'approve',
    action,
    // For the session check this is the session's hash: bound to it, never logged.
    target: target.slice(0, 200),
    createdAt: now,
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
  });
  return options;
}

/**
 * Checks a passkey assertion for `action` on `target`: the challenge must be
 * this user's, for this action and target, unused and under 2 minutes old;
 * the passkey must be this user's and usable; user verification is required
 * and the signature counter must move forward. The challenge is used up.
 * Throws PasskeyError.
 */
export async function verifyApproval(
  db: Db,
  user: User,
  action: ApprovalAction,
  target: string,
  raw: unknown,
  deps: { verifier: Verifier; rp: RelyingParty; now?: Date },
): Promise<Passkey> {
  const now = deps.now ?? new Date();
  const refused = (why: string) => new PasskeyError(why);
  const response = parseCredentialJson<AuthenticationResponseJSON>(raw);
  if (!response) throw refused('Approve this with your passkey first.');
  const challenge = challengeOf(response);
  if (!challenge) throw refused('The passkey response is not valid. Try again.');
  const [ch] = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.challenge, challenge)).limit(1);
  if (!ch || ch.userId !== user.id || ch.purpose !== 'approve') throw refused('This passkey approval isn’t valid. Try again.');
  if (ch.action !== action || ch.target !== target.slice(0, 200)) throw refused('This passkey approval was for something else. Try again.');
  if (ch.usedAt) throw refused('This passkey approval was already used. Try again.');
  if (ch.expiresAt.getTime() <= now.getTime()) throw refused('This passkey approval has expired (2 minutes). Try again.');
  const [key] = await db
    .select()
    .from(adminPasskeys)
    .where(and(eq(adminPasskeys.credentialId, response.id), eq(adminPasskeys.userId, user.id)))
    .limit(1);
  if (!key || !isUsable(key, now)) throw refused(key ? 'This passkey isn’t usable yet (added through recovery: it waits 24 hours).' : 'That passkey isn’t registered to your account.');
  const result = await deps.verifier
    .verifyAuthentication({ rp: deps.rp, response, challenge: ch.challenge, credential: { id: key.credentialId, publicKey: unb64(key.publicKey), counter: key.counter, transports: key.transports } })
    .catch(() => ({ verified: false, newCounter: 0 }));
  if (!result.verified) throw refused('The passkey check failed. Try again.');
  if ((key.counter > 0 || result.newCounter > 0) && result.newCounter <= key.counter) {
    await audit(db, { actor: user.id, action: 'admin.passkey_counter_refused', targetType: 'user', targetId: user.id, details: { passkey: key.id, action } });
    throw refused('This passkey’s signature counter went backwards (a cloned key?). The approval was refused.');
  }
  return db.transaction(async (tx) => {
    const [used] = await tx
      .update(webauthnChallenges)
      .set({ usedAt: now })
      .where(and(eq(webauthnChallenges.id, ch.id), isNull(webauthnChallenges.usedAt), gt(webauthnChallenges.expiresAt, now)))
      .returning({ id: webauthnChallenges.id });
    if (!used) throw refused('This passkey approval was already used. Try again.');
    const [updated] = await tx
      .update(adminPasskeys)
      .set({ counter: result.newCounter, lastUsedAt: now })
      .where(and(eq(adminPasskeys.id, key.id), or(eq(adminPasskeys.counter, key.counter), sql`${result.newCounter} = 0`)))
      .returning();
    if (!updated) throw refused('This passkey was used at the same moment elsewhere. Try again.');
    await audit(tx, { actor: user.id, action: 'admin.passkey_approve', targetType: 'user', targetId: user.id, details: { passkey: key.id, action, ...(action === SESSION_ACTION ? {} : { target: target.slice(0, 200) }) } });
    return updated;
  });
}

/** Marks this session as checked (12 hours) after a verified 'admin.session' approval bound to it. */
export async function markSessionVerified(db: Db, user: User, sessionHash: string, passkeyId: string, now = new Date()): Promise<void> {
  await db
    .insert(adminSessionChecks)
    .values({ sessionHash, userId: user.id, passkeyId, verifiedAt: now })
    .onConflictDoUpdate({ target: adminSessionChecks.sessionHash, set: { userId: user.id, passkeyId, verifiedAt: now } });
}

// ---------------------------------------------------------------------------
// Managing

export async function renamePasskey(db: Db, user: User, id: string, rawName: string): Promise<void> {
  const name = rawName.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 60);
  if (!name) throw new PasskeyError('Enter a name.');
  const [row] = await db
    .update(adminPasskeys)
    .set({ name })
    .where(and(eq(adminPasskeys.id, id), eq(adminPasskeys.userId, user.id)))
    .returning({ id: adminPasskeys.id });
  if (!row) throw new PasskeyError('No such passkey.');
  await audit(db, { actor: user.id, action: 'admin.passkey_rename', targetType: 'user', targetId: user.id, details: { passkey: id, name } });
}

/** Removes a passkey (the caller checked a passkey approval for it). Never the last usable one. */
export async function removePasskey(db: Db, user: User, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`passkeys:${user.id}`}, 0))`);
    const [row] = await tx
      .select()
      .from(adminPasskeys)
      .where(and(eq(adminPasskeys.id, id), eq(adminPasskeys.userId, user.id)))
      .limit(1);
    if (!row) throw new PasskeyError('No such passkey.');
    const others = await tx
      .select({ id: adminPasskeys.id })
      .from(adminPasskeys)
      .where(and(eq(adminPasskeys.userId, user.id), ne(adminPasskeys.id, id), lte(adminPasskeys.usableFrom, now)));
    if (others.length === 0) throw new PasskeyError('This is your only working passkey. Add another one before you remove it.');
    await tx.delete(adminPasskeys).where(eq(adminPasskeys.id, id));
    await audit(tx, { actor: user.id, action: 'admin.passkey_remove', targetType: 'user', targetId: user.id, details: { passkey: id, name: row.name } });
  });
}

/** Old links and challenges, for the daily prune. */
export async function prunePasskeyRows(db: Db, now = new Date()): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const [a, b, c] = await Promise.all([
    db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, dayAgo)).returning({ x: webauthnChallenges.id }),
    db.delete(adminPasskeyLinks).where(lt(adminPasskeyLinks.expiresAt, dayAgo)).returning({ x: adminPasskeyLinks.id }),
    db.delete(adminSessionChecks).where(lt(adminSessionChecks.verifiedAt, new Date(now.getTime() - SESSION_CHECK_TTL_MS))).returning({ x: adminSessionChecks.sessionHash }),
  ]);
  return a.length + b.length + c.length;
}
