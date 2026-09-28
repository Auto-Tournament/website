import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../db/testing';
import { adminPasskeys, auditLog, sessions, users } from '../db/schema';
import {
  adminGate,
  approvalOptions,
  completeRegistration,
  createPasskeyLink,
  markSessionVerified,
  PasskeyError,
  registrationOptions,
  removePasskey,
  RECOVERY_DELAY_MS,
  SESSION_ACTION,
  verifyApproval,
  type ApprovalAction,
} from './passkeys';
import type { AuthenticationResponseJSON, RegistrationResponseJSON, RelyingParty, Verifier } from './webauthn';

// Admin passkeys against PGlite with a fake WebAuthn verifier: it accepts a
// response when its clientDataJSON carries the expected challenge, the
// credential id matches and user verification is set ("uv"); the signature
// field carries the counter.

const rp: RelyingParty = { name: 'test', id: 'localhost', origin: 'http://localhost:4611' };
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const clientData = (challenge: string) => b64(JSON.stringify({ type: 'webauthn.get', challenge, origin: rp.origin }));
const challengeIn = (r: { response: { clientDataJSON: string } }) => (JSON.parse(Buffer.from(r.response.clientDataJSON, 'base64url').toString()) as { challenge: string }).challenge;

const verifier: Verifier = {
  registrationOptions: async () => ({ challenge: randomBytes(16).toString('base64url') }) as never,
  verifyRegistration: async ({ response, challenge }) =>
    challengeIn(response) === challenge ? { verified: true, credential: { id: response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] } } : { verified: false },
  authenticationOptions: async ({ allow }) => ({ challenge: randomBytes(16).toString('base64url'), allowCredentials: allow }) as never,
  verifyAuthentication: async ({ response, challenge, credential }) => ({
    verified: challengeIn(response) === challenge && response.id === credential.id && response.response.authenticatorData === 'uv',
    newCounter: Number(response.response.signature),
  }),
};
const deps = (now = new Date(), sessionVerified = false) => ({ verifier, rp, now, sessionVerified });

const registration = (credId: string, challenge: string): RegistrationResponseJSON =>
  ({ id: credId, rawId: credId, type: 'public-key', response: { clientDataJSON: clientData(challenge), attestationObject: 'x' }, clientExtensionResults: {} }) as never;
const assertion = (credId: string, challenge: string, counter: number, uv = true): string =>
  JSON.stringify({
    id: credId,
    rawId: credId,
    type: 'public-key',
    response: { clientDataJSON: clientData(challenge), authenticatorData: uv ? 'uv' : 'up', signature: String(counter) },
    clientExtensionResults: {},
  } satisfies AuthenticationResponseJSON);

let t: Awaited<ReturnType<typeof testDb>>;
let n = 0;
type U = { id: string; email: string };

async function newAdmin(): Promise<U> {
  const [row] = await t.db.insert(users).values({ email: `pk${n++}@example.com`, emailVerified: new Date(), isAdmin: true }).returning();
  return { id: row.id, email: row.email! };
}

/** Adds a passkey through an emailed link of `purpose`. */
async function addPasskey(user: U, credId: string, purpose: 'register' | 'recover' = 'register', now = new Date(), sessionVerified = false) {
  const token = await createPasskeyLink(t.db, user, purpose, { sessionVerified }, now);
  const options = await registrationOptions(t.db, user, token, deps(now, sessionVerified));
  return completeRegistration(t.db, user, token, { name: `Key ${credId}`, response: registration(credId, options.challenge) }, deps(now, sessionVerified));
}

async function approve(user: U, credId: string, action: ApprovalAction, target: string, counter: number, now = new Date()) {
  const options = await approvalOptions(t.db, user, action, target, { verifier, rp, now });
  return assertion(credId, options.challenge, counter);
}

beforeAll(async () => {
  t = await testDb();
}, 60_000);
afterAll(async () => {
  await t.close();
});
let counter = 0;
beforeEach(() => {
  counter += 10;
});

describe('setting up', () => {
  it('without a passkey the gate is "setup" and nothing can be approved', async () => {
    const user = await newAdmin();
    expect(await adminGate(t.db, user.id, null)).toBe('setup');
    await expect(approvalOptions(t.db, user, 'license.reissue', 'L-1', { verifier, rp })).rejects.toThrow(/Set up a passkey first/);
  });

  it('adding a passkey needs the emailed link: its token, for this admin, once', async () => {
    const user = await newAdmin();
    const other = await newAdmin();
    await expect(registrationOptions(t.db, user, 'x'.repeat(43), deps())).rejects.toThrow(PasskeyError);
    const token = await createPasskeyLink(t.db, user, 'register', { sessionVerified: false });
    await expect(registrationOptions(t.db, other, token, deps())).rejects.toThrow(/isn’t valid for the account/);
    const options = await registrationOptions(t.db, user, token, deps());
    const { passkey, recovery } = await completeRegistration(t.db, user, token, { name: 'MacBook', response: registration('cred-a', options.challenge) }, deps());
    expect(passkey).toMatchObject({ name: 'MacBook', credentialId: 'cred-a', userId: user.id });
    expect(recovery).toBe(false);
    await expect(registrationOptions(t.db, user, token, deps())).rejects.toThrow(/already used/);
    const logged = await t.db.select().from(auditLog).where(eq(auditLog.targetId, user.id));
    expect(logged.map((a) => a.action)).toEqual(expect.arrayContaining(['admin.passkey_link', 'admin.passkey_register']));
    expect(JSON.stringify(logged.map((a) => a.details))).not.toMatch(/cred-a|AQID/);
    expect(await adminGate(t.db, user.id, null)).toBe('verify');
  });

  it('an expired link adds nothing', async () => {
    const user = await newAdmin();
    const then = new Date(Date.now() - 20 * 60_000);
    const token = await createPasskeyLink(t.db, user, 'register', { sessionVerified: false }, then);
    await expect(registrationOptions(t.db, user, token, deps())).rejects.toThrow(/expired/);
  });

  it('with a passkey already, another one needs this session checked (or recovery)', async () => {
    const user = await newAdmin();
    await addPasskey(user, `cred-${user.id}-1`);
    await expect(createPasskeyLink(t.db, user, 'register', { sessionVerified: false })).rejects.toThrow(/Check your passkey/);
    await addPasskey(user, `cred-${user.id}-2`, 'register', new Date(), true);
    expect(await t.db.select().from(adminPasskeys).where(eq(adminPasskeys.userId, user.id))).toHaveLength(2);
  });
});

describe('approvals', () => {
  let user: U;
  let cred: string;
  beforeAll(async () => {
    user = await newAdmin();
    cred = `cred-approve-${user.id}`;
    await addPasskey(user, cred);
  });

  it('a fresh assertion for this action and target is accepted once', async () => {
    const a = await approve(user, cred, 'license.reissue', 'L-1', counter);
    await expect(verifyApproval(t.db, user, 'license.reissue', 'L-1', a, deps())).resolves.toMatchObject({ counter });
    // Replayed.
    await expect(verifyApproval(t.db, user, 'license.reissue', 'L-1', a, deps())).rejects.toThrow(/already used/);
    const logged = await t.db.select().from(auditLog).where(eq(auditLog.action, 'admin.passkey_approve'));
    expect(logged.some((l) => l.details.action === 'license.reissue' && l.details.target === 'L-1')).toBe(true);
  });

  it('bound to the action and the target', async () => {
    const a = await approve(user, cred, 'license.reissue', 'L-1', counter);
    await expect(verifyApproval(t.db, user, 'license.revoke', 'L-1', a, deps())).rejects.toThrow(/for something else/);
    await expect(verifyApproval(t.db, user, 'license.reissue', 'L-2', a, deps())).rejects.toThrow(/for something else/);
  });

  it('stale (over 2 minutes) is refused', async () => {
    const a = await approve(user, cred, 'export.sales', 'sales', counter);
    await expect(verifyApproval(t.db, user, 'export.sales', 'sales', a, deps(new Date(Date.now() + 3 * 60_000)))).rejects.toThrow(/expired/);
  });

  it('no assertion, no user verification, another admin, or a counter going back: refused', async () => {
    await expect(verifyApproval(t.db, user, 'export.sales', 'sales', null, deps())).rejects.toThrow(/Approve this with your passkey/);
    const opts = await approvalOptions(t.db, user, 'export.sales', 'sales', { verifier, rp });
    await expect(verifyApproval(t.db, user, 'export.sales', 'sales', assertion(cred, opts.challenge, counter, false), deps())).rejects.toThrow(/check failed/);
    const other = await newAdmin();
    await addPasskey(other, `cred-other-${other.id}`);
    const theirs = await approve(other, `cred-other-${other.id}`, 'export.sales', 'sales', 1);
    await expect(verifyApproval(t.db, user, 'export.sales', 'sales', theirs, deps())).rejects.toThrow(/isn’t valid/);
    const ok = await approve(user, cred, 'export.sales', 'sales', counter);
    await verifyApproval(t.db, user, 'export.sales', 'sales', ok, deps());
    const back = await approve(user, cred, 'export.sales', 'sales', counter - 1);
    await expect(verifyApproval(t.db, user, 'export.sales', 'sales', back, deps())).rejects.toThrow(/counter went backwards/);
  });
});

describe('the session check', () => {
  it('opens /admin for 12 hours, for this session only', async () => {
    const user = await newAdmin();
    const cred = `cred-session-${user.id}`;
    const { passkey } = await addPasskey(user, cred);
    await t.db.insert(sessions).values({ sessionToken: `hash-${user.id}`, userId: user.id, expires: new Date(Date.now() + 30 * 86_400_000) });
    const a = await approve(user, cred, SESSION_ACTION, `hash-${user.id}`, 1);
    await verifyApproval(t.db, user, SESSION_ACTION, `hash-${user.id}`, a, deps());
    await markSessionVerified(t.db, user, `hash-${user.id}`, passkey.id);
    expect(await adminGate(t.db, user.id, `hash-${user.id}`)).toBe('ok');
    expect(await adminGate(t.db, user.id, 'another-session')).toBe('verify');
    expect(await adminGate(t.db, user.id, `hash-${user.id}`, new Date(Date.now() + 13 * 60 * 60_000))).toBe('verify');
    // Signed out: the check goes with the session.
    await t.db.delete(sessions).where(eq(sessions.userId, user.id));
    expect(await adminGate(t.db, user.id, `hash-${user.id}`)).toBe('verify');
  });
});

describe('recovery', () => {
  it('a passkey added by recovery works only 24 hours later', async () => {
    const user = await newAdmin();
    const now = new Date();
    const { passkey, recovery } = await addPasskey(user, `cred-recover-${user.id}`, 'recover', now);
    expect(recovery).toBe(true);
    expect(passkey.usableFrom.getTime() - now.getTime()).toBe(RECOVERY_DELAY_MS);
    expect(await adminGate(t.db, user.id, null, now)).toBe('setup');
    await expect(approvalOptions(t.db, user, 'export.sales', 'sales', { verifier, rp, now })).rejects.toThrow(/Set up a passkey first/);
    const later = new Date(now.getTime() + RECOVERY_DELAY_MS + 1000);
    expect(await adminGate(t.db, user.id, null, later)).toBe('verify');
    const a = await approve(user, `cred-recover-${user.id}`, 'export.sales', 'sales', 1, later);
    await expect(verifyApproval(t.db, user, 'export.sales', 'sales', a, deps(later))).resolves.toBeTruthy();
    const logged = await t.db.select().from(auditLog).where(eq(auditLog.targetId, user.id));
    expect(logged.map((l) => l.action)).toContain('admin.passkey_recover');
  });

  it('a waiting recovery passkey can’t approve even with another passkey present', async () => {
    const user = await newAdmin();
    await addPasskey(user, `cred-main-${user.id}`);
    await addPasskey(user, `cred-rec-${user.id}`, 'recover');
    const opts = await approvalOptions(t.db, user, 'export.sales', 'sales', { verifier, rp });
    await expect(verifyApproval(t.db, user, 'export.sales', 'sales', assertion(`cred-rec-${user.id}`, opts.challenge, 1), deps())).rejects.toThrow(/isn’t usable yet/);
  });
});

describe('removing', () => {
  it('never the last working passkey', async () => {
    const user = await newAdmin();
    const { passkey: first } = await addPasskey(user, `cred-r1-${user.id}`);
    await expect(removePasskey(t.db, user, first.id)).rejects.toThrow(/only working passkey/);
    const { passkey: second } = await addPasskey(user, `cred-r2-${user.id}`, 'register', new Date(), true);
    await removePasskey(t.db, user, first.id);
    await expect(removePasskey(t.db, user, second.id)).rejects.toThrow(/only working passkey/);
    const logged = await t.db.select().from(auditLog).where(eq(auditLog.action, 'admin.passkey_remove'));
    expect(logged.some((l) => l.details.passkey === first.id)).toBe(true);
  });
});
