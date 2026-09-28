import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '@/lib/db/client';
import { testDb } from '@/lib/db/testing';
import { licenses, sessions, users } from '@/lib/db/schema';
import type { ConsoleUser } from '@/lib/console/orgs';
import { toRow } from '@/lib/license/store';

// The passkey layer through the server actions: the real gate and approval
// code, with the session, headers/cookies and Postmark mocked and a fake
// WebAuthn verifier (a response is accepted when its clientDataJSON carries
// the challenge the server handed out and user verification is set).

const state: { user: ConsoleUser | null } = { user: null };
const SESSION = 'session-cookie-value';

vi.mock('@/lib/console/session', () => ({
  currentUser: async () => state.user,
  requireUser: async () => state.user,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'sec-fetch-site': 'same-origin', host: 'localhost:4611' }),
  cookies: async () => ({ get: (name: string) => (name === 'authjs.session-token' ? { value: SESSION } : undefined), set: () => {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/console/auth', () => ({ consoleEnabled: () => true }));
vi.mock('@/lib/admin/webauthn', () => {
  const challengeIn = (r: { response: { clientDataJSON: string } }) => (JSON.parse(Buffer.from(r.response.clientDataJSON, 'base64url').toString()) as { challenge: string }).challenge;
  const random = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return {
    relyingParty: () => ({ name: 'test', id: 'localhost', origin: 'http://localhost:4611' }),
    simpleWebAuthn: {
      registrationOptions: async () => ({ challenge: random() }),
      verifyRegistration: async ({ response, challenge }: { response: { id: string; response: { clientDataJSON: string } }; challenge: string }) =>
        challengeIn(response) === challenge ? { verified: true, credential: { id: response.id, publicKey: new Uint8Array([1]), counter: 0, transports: [] } } : { verified: false },
      authenticationOptions: async () => ({ challenge: random() }),
      verifyAuthentication: async ({ response, challenge, credential }: { response: { id: string; response: { clientDataJSON: string; authenticatorData: string } }; challenge: string; credential: { id: string } }) => ({
        verified: challengeIn(response) === challenge && response.id === credential.id && response.response.authenticatorData === 'uv',
        newCounter: 0,
      }),
    },
  };
});

let t: Awaited<ReturnType<typeof testDb>>;
let admin: typeof users.$inferSelect;
type Sent = { To: string; Subject: string; Tag: string; TextBody: string };
let sent: Sent[] = [];

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const clientData = (challenge: string) => Buffer.from(JSON.stringify({ challenge }), 'utf8').toString('base64url');
const assertion = (cred: string, challenge: string) =>
  JSON.stringify({ id: cred, rawId: cred, type: 'public-key', response: { clientDataJSON: clientData(challenge), authenticatorData: 'uv', signature: 's' }, clientExtensionResults: {} });
const tokenIn = (mail: Sent | undefined) => mail?.TextBody.match(/token=([A-Za-z0-9_-]{43})/)?.[1] ?? '';

const pk = () => import('./passkeyActions');

async function addPasskey(cred: string, purpose: 'register' | 'recover' = 'register') {
  const { requestPasskeyLinkAction, passkeyRegistrationOptionsAction, completePasskeyRegistrationAction } = await pk();
  expect(await requestPasskeyLinkAction(null, form({ purpose }))).toHaveProperty('ok');
  const mail = sent.at(-1)!;
  expect(mail.To).toBe(admin.email);
  const token = tokenIn(mail);
  const opts = (await passkeyRegistrationOptionsAction(null, form({ token })))?.options as { challenge: string };
  const response = JSON.stringify({ id: cred, rawId: cred, type: 'public-key', response: { clientDataJSON: clientData(opts.challenge), attestationObject: 'x' }, clientExtensionResults: {} });
  return completePasskeyRegistrationAction(null, form({ token, name: 'Laptop', response }));
}

async function approval(action: string, target: string, cred: string): Promise<string> {
  const res = await (await pk()).approvalOptionsAction(null, form({ action, target }));
  const challenge = (res?.options as { challenge: string } | undefined)?.challenge;
  if (!challenge) throw new Error(res?.error ?? 'no options');
  return assertion(cred, challenge);
}

beforeAll(async () => {
  t = await testDb();
  setDb(t.db);
  [admin] = await t.db.insert(users).values({ email: 'passkey-admin@example.com', emailVerified: new Date(), isAdmin: true }).returning();
  await t.db.insert(sessions).values({ sessionToken: createHash('sha256').update(SESSION).digest('hex'), userId: admin.id, expires: new Date(Date.now() + 86_400_000) });
  await t.db.insert(licenses).values(
    toRow({
      session_id: 'cs_live_pk1',
      invoice_number: null,
      email_sha256: null,
      livemode: true,
      dates_from_form: false,
      token: 'ATL1.x.y',
      payload: { v: 1, kid: 'k', id: 'L-passkey1', customer: 'cus_X', product: 'servers', pack: 'M', max_servers: 20, kind: 'year', issued_at: '2026-09-01T00:00:00Z', updates_until: '2027-09-01' },
    }),
  );
}, 60_000);
afterAll(async () => {
  setDb(null);
  await t.close();
});
beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', 'passkey-admin@example.com');
  vi.stubEnv('AUTH_URL', 'http://localhost:4611');
  vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token');
  vi.stubEnv('LICENSE_SIGNING_KEY', '');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.user = { id: admin.id, email: admin.email, emailVerified: admin.emailVerified, name: null, isAdmin: true };
  sent = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return Response.json({ ErrorCode: 0, MessageID: `m-${randomBytes(4).toString('hex')}` });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin passkeys, end to end through the actions', () => {
  it('in order: blocked → email link → passkey → session check → approvals bound to the action', async () => {
    const actions = await import('./actions');
    const note = form({ licenseId: 'L-passkey1', body: 'hello' });

    // No passkey: nothing works, nothing can be approved.
    expect(await actions.addLicenseNoteAction(null, note)).toEqual({ error: expect.stringMatching(/Set up a passkey/) });
    expect(await (await pk()).approvalOptionsAction(null, form({ action: 'license.reissue', target: 'L-passkey1' }))).toEqual({ error: expect.stringMatching(/Set up a passkey/) });

    // Registration goes through the email link to the admin's own address.
    expect(await addPasskey('cred-1')).toEqual({ ok: 'Passkey added.' });
    expect(sent.map((m) => m.Tag)).toEqual(['admin-passkey-link', 'admin-passkey-added']);

    // A passkey now, but this session isn't checked yet.
    expect(await actions.addLicenseNoteAction(null, note)).toEqual({ error: expect.stringMatching(/Check your passkey/) });
    expect(await (await pk()).approvalOptionsAction(null, form({ action: 'license.reissue', target: 'L-passkey1' }))).toEqual({ error: expect.stringMatching(/Check your passkey/) });
    const check = await approval('admin.session', '', 'cred-1');
    expect(await (await pk()).verifySessionAction(null, form({ passkey: check }))).toEqual({ ok: 'Passkey checked.' });
    expect(await actions.addLicenseNoteAction(null, note)).toEqual({ ok: 'Note added.' });

    // Sensitive actions need a fresh approval for themselves and their target.
    const reissue = (passkey?: string) => actions.reissueAction(null, form({ licenseId: 'L-passkey1', ...(passkey ? { passkey } : {}) }));
    expect(await reissue()).toEqual({ error: 'Approve this with your passkey first.' });
    expect(await reissue(await approval('license.reissue', 'L-other', 'cred-1'))).toEqual({ error: expect.stringMatching(/for something else/) });
    expect(await reissue(await approval('license.revoke', 'L-passkey1', 'cred-1'))).toEqual({ error: expect.stringMatching(/for something else/) });
    const good = await approval('license.reissue', 'L-passkey1', 'cred-1');
    // Past the approval (then stopped by the missing signing key in this test).
    expect(await reissue(good)).toEqual({ error: expect.stringMatching(/License signing is not set up/) });
    // Replayed.
    expect(await reissue(good)).toEqual({ error: expect.stringMatching(/already used/) });
  });

  it('adding a second passkey needs the checked session; removing needs an approval, never the last', async () => {
    const { removePasskeyAction } = await pk();
    expect(await addPasskey('cred-2')).toEqual({ ok: 'Passkey added.' });
    const keys = (await import('@/lib/admin/passkeys')).passkeysOf;
    const [first, second] = await keys(t.db, admin.id);
    expect(await removePasskeyAction(null, form({ passkeyId: first.id }))).toEqual({ error: 'Approve this with your passkey first.' });
    expect(await removePasskeyAction(null, form({ passkeyId: first.id, passkey: await approval('passkey.remove', second.id, 'cred-2') }))).toEqual({
      error: expect.stringMatching(/for something else/),
    });
    expect(await removePasskeyAction(null, form({ passkeyId: first.id, passkey: await approval('passkey.remove', first.id, 'cred-2') }))).toEqual({ ok: 'Passkey removed.' });
    expect(await removePasskeyAction(null, form({ passkeyId: second.id, passkey: await approval('passkey.remove', second.id, 'cred-2') }))).toEqual({
      error: expect.stringMatching(/only working passkey/),
    });
  });

  it('recovery: the new passkey waits 24 hours, and a warning goes out at once', async () => {
    const result = await addPasskey('cred-recovered', 'recover');
    expect(result?.ok).toMatch(/starts to work at/);
    expect(sent.at(-1)).toMatchObject({ To: admin.email, Tag: 'admin-passkey-added', Subject: expect.stringMatching(/^Warning: a recovery passkey/) });
    const { approvalError } = await import('@/lib/admin/approval');
    const a = await approval('export.sales', 'sales', 'cred-recovered');
    expect(await approvalError(state.user!, 'export.sales', 'sales', form({ passkey: a }))).toMatch(/isn’t usable yet/);
  });
});
