import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { licenseStatus, statusText } from '../license/describe';
import { emailHash, type LicensePayload } from '../license/format';
import { createLicenseStore, type LicenseRecord } from '../license/store';
import { publicCheck } from '../license/verify';
import { signInEmail } from './email';
import { sendSignInLink } from './service';
import { accountSecret, clearedSessionCookie, sessionCookie, signSession, verifySession } from './session';
import { createAccountStore, SESSION_TTL_MS, TOKEN_TTL_MS } from './store';
import { compareVersions, coverageFor, parseVersion, releaseLines, type GithubRelease } from './versions';

const rel = (tag: string, day: string, prerelease = false, draft = false): GithubRelease => ({
  tag_name: tag,
  published_at: `${day}T12:00:00Z`,
  prerelease,
  draft,
});

describe('release lines', () => {
  const releases = [
    rel('v1.0.0', '2026-01-10'),
    rel('v1.0.1', '2026-02-01'),
    rel('v1.1.0-beta.1', '2026-02-20', true),
    rel('v1.1.0', '2026-03-01'),
    rel('v1.1.5', '2027-06-01'), // a late patch of a covered line
    rel('v1.2.0', '2026-10-01'),
    rel('v2.0.0-beta.1', '2026-12-01', true),
    rel('v2.0.0-beta.2', '2026-12-05', true),
    rel('v2.1.0', '2027-01-01', false, true), // draft: ignored
    rel('cs2-plugin-7', '2026-05-01'), // not a version: ignored
  ];

  it('groups by major.minor, dated by x.y.0, pre-releases only for lines without a stable x.y.0', () => {
    const lines = releaseLines(releases);
    expect(lines.map((l) => [l.name, l.date, l.newest.tag])).toEqual([
      ['1.0', '2026-01-10', 'v1.0.1'],
      ['1.1', '2026-03-01', 'v1.1.5'],
      ['1.2', '2026-10-01', 'v1.2.0'],
      ['2.0', '2026-12-01', 'v2.0.0-beta.2'],
    ]);
  });

  it('a yearly license covers lines dated on or before updates_until, with their later patches', () => {
    const c = coverageFor(releaseLines(releases), '2026-10-01');
    expect(c.covered.map((l) => l.name)).toEqual(['1.0', '1.1', '1.2']);
    expect(c.newestCovered?.tag).toBe('v1.2.0');
    expect(c.latest?.tag).toBe('v2.0.0-beta.2');
    expect(c.firstUncovered?.name).toBe('2.0');
    // 1.1.5 came out after updates_until, but its line didn't.
    expect(coverageFor(releaseLines(releases), '2026-09-30').newestCovered?.tag).toBe('v1.1.5');
  });

  it('founder covers every line', () => {
    const c = coverageFor(releaseLines(releases), '9999-12-31');
    expect(c.covered).toHaveLength(4);
    expect(c.firstUncovered).toBeNull();
  });

  it('handles no releases', () => {
    expect(coverageFor(releaseLines([]), '2027-01-01')).toMatchObject({ lines: [], covered: [], newestCovered: null, latest: null, firstUncovered: null });
  });

  it('orders versions like semver', () => {
    const v = (tag: string) => parseVersion(tag, '2026-01-01T00:00:00Z')!;
    expect(compareVersions(v('1.0.0-beta.2'), v('1.0.0-beta.10'))).toBeLessThan(0);
    expect(compareVersions(v('1.0.0-beta.10'), v('1.0.0'))).toBeLessThan(0);
    expect(compareVersions(v('1.10.0'), v('1.9.9'))).toBeGreaterThan(0);
    expect(parseVersion('v1.2', '2026-01-01T00:00:00Z')).toBeNull();
  });
});

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    kid: 'kid',
    id: 'L-abcdefgh',
    customer: 'cus_TEST123',
    licensee: 'Example LAN AS',
    product: 'servers',
    pack: 'M',
    max_servers: 20,
    kind: 'event',
    issued_at: '2026-09-28T10:00:00Z',
    updates_until: '2026-10-05',
    valid_from: '2026-10-03',
    valid_to: '2026-10-05',
    ...over,
  };
}

describe('license status', () => {
  it('event: upcoming, active, expired', () => {
    expect(licenseStatus(payload(), '2026-10-02')).toBe('upcoming');
    expect(licenseStatus(payload(), '2026-10-03')).toBe('active');
    expect(licenseStatus(payload(), '2026-10-05')).toBe('active');
    expect(licenseStatus(payload(), '2026-10-06')).toBe('expired');
  });
  it('year: active, then updates ended; founder: always active', () => {
    const year = payload({ kind: 'year', updates_until: '2027-09-28', valid_from: undefined, valid_to: undefined });
    expect(licenseStatus(year, '2027-09-28')).toBe('active');
    expect(licenseStatus(year, '2027-09-29')).toBe('updates-ended');
    expect(statusText(year, '2027-09-29')).toContain('stay licensed');
    expect(licenseStatus(payload({ kind: 'founder', updates_until: '9999-12-31' }), '2099-01-01')).toBe('active');
  });
});

describe('public check', () => {
  const record = (over: Partial<LicensePayload> = {}, livemode = true) => ({
    session_id: 'cs_live_secretref',
    invoice_number: 'INV-1',
    email_sha256: emailHash('buyer@example.com'),
    livemode,
    dates_from_form: true,
    payload: payload(over),
    token: 'ATL1.secret.key',
  });

  it('shows only the public fields', () => {
    const c = publicCheck(record(), '2026-10-04');
    expect(c.status).toBe('valid');
    const shown = JSON.stringify(c);
    for (const hidden of ['ATL1', 'cs_live_secretref', 'INV-1', 'cus_TEST123', emailHash('buyer@example.com'), '@']) expect(shown).not.toContain(hidden);
    expect(shown).toContain('Example LAN AS');
    expect(shown).toContain('Servers M');
  });

  it('upcoming, expired, test and not found', () => {
    expect(publicCheck(record(), '2026-10-01').status).toBe('upcoming');
    expect(publicCheck(record(), '2026-10-09').status).toBe('expired');
    expect(publicCheck(record({}, false), '2026-10-04').status).toBe('test');
    expect(publicCheck(null, '2026-10-04')).toEqual({ status: 'not-found' });
  });
});

describe('session cookie', () => {
  const secret = 'x'.repeat(40);
  const id = 'A'.repeat(43);

  it('needs a long enough secret', () => {
    expect(accountSecret({})).toBeNull();
    expect(accountSecret({ ACCOUNT_SESSION_SECRET: 'short' })).toBeNull();
    expect(accountSecret({ ACCOUNT_SESSION_SECRET: secret })).toBe(secret);
  });

  it('verifies only what it signed', () => {
    const value = signSession(id, secret);
    expect(verifySession(value, secret)).toBe(id);
    expect(verifySession(value, 'y'.repeat(40))).toBeNull();
    expect(verifySession(`${'B'.repeat(43)}.${value.split('.')[1]}`, secret)).toBeNull();
    expect(verifySession(`${value}x`, secret)).toBeNull();
    expect(verifySession(undefined, secret)).toBeNull();
  });

  it('sets the cookie flags', () => {
    const c = sessionCookie('v');
    expect(c).toMatch(/^__Host-at-account=v; /);
    for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', `Max-Age=${30 * 24 * 60 * 60}`]) expect(c).toContain(flag);
    expect(clearedSessionCookie()).toContain('Max-Age=0');
  });
});

describe('account store', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'account-'));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  const hash = emailHash('buyer@example.com');

  it('a sign-in token works once, keeps only hashes, and the file is private', async () => {
    const store = createAccountStore(dir);
    const token = await store.createToken(hash, 1_000);
    const [a, b] = await Promise.all([store.signIn(token, 2_000), store.signIn(token, 2_000)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const session = (a ?? b)!;
    expect(session.emailSha256).toBe(hash);
    expect(await store.session(session.sessionId, 3_000)).toBe(hash);

    const text = await readFile(store.file, 'utf8');
    expect(text).not.toContain(token);
    expect(text).not.toContain(session.sessionId);
    expect(text).not.toContain('@');
    expect((await stat(store.file)).mode & 0o777).toBe(0o600);

    // Another process reads the same session.
    expect(await createAccountStore(dir).session(session.sessionId, 3_000)).toBe(hash);
  });

  it('tokens expire after 15 minutes, sessions after 30 days', async () => {
    const store = createAccountStore(dir);
    const late = await store.createToken(hash, 0);
    expect(await store.signIn(late, TOKEN_TTL_MS + 1)).toBeNull();
    const token = await store.createToken(hash, 0);
    const s = (await store.signIn(token, 10))!;
    expect(await store.session(s.sessionId, 10 + SESSION_TTL_MS - 1)).toBe(hash);
    expect(await store.session(s.sessionId, 10 + SESSION_TTL_MS)).toBeNull();
    expect(await store.signIn('A'.repeat(43), 10)).toBeNull();
  });

  it('prunes expired entries and signs out', async () => {
    const store = createAccountStore(dir);
    await store.createToken(hash, 0);
    const s = (await store.signIn(await store.createToken(hash, 0), 0))!;
    await store.createToken(hash, TOKEN_TTL_MS + 5); // this write drops the expired one
    const saved = JSON.parse(await readFile(store.file, 'utf8'));
    expect(saved.tokens).toHaveLength(1);
    await store.deleteSession(s.sessionId);
    expect(await store.session(s.sessionId, 1)).toBeNull();
  });

  it('sends a sign-in link only when the email has a license', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token');
    vi.stubEnv('ACCOUNT_SESSION_SECRET', 'z'.repeat(40));
    vi.stubEnv('SITE_URL', '');
    const licenses = createLicenseStore(dir);
    const accounts = createAccountStore(dir);
    await licenses.issueOnce('cs_test_1', async (): Promise<LicenseRecord> => ({
      session_id: 'cs_test_1',
      invoice_number: null,
      email_sha256: hash,
      livemode: false,
      dates_from_form: false,
      payload: payload(),
      token: 'ATL1.x.y',
    }));
    const sent: { To: string; TextBody: string }[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(init?.body as string));
      return Response.json({ ErrorCode: 0, MessageID: 'm' });
    });

    const other = emailHash('nobody@example.com');
    expect(await sendSignInLink('nobody@example.com', other, { licenses, accounts, fetchImpl })).toBe('no-license');
    expect(fetchImpl).not.toHaveBeenCalled();

    expect(await sendSignInLink('buyer@example.com', hash, { licenses, accounts, fetchImpl })).toBe('sent');
    expect(sent[0].To).toBe('buyer@example.com');
    const token = /\/account\/signin\?token=([A-Za-z0-9_-]{43})/.exec(sent[0].TextBody)?.[1];
    expect(token).toBeTruthy();
    expect((await accounts.signIn(token!))?.emailSha256).toBe(hash);
    expect(await accounts.signIn(token!)).toBeNull();
  });

  it('is off without the secret', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token');
    vi.stubEnv('ACCOUNT_SESSION_SECRET', '');
    const fetchImpl = vi.fn();
    expect(await sendSignInLink('buyer@example.com', hash, { fetchImpl })).toBe('disabled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('sign-in email', () => {
  it('has the link, escaped in the HTML', () => {
    const mail = signInEmail('https://autotournament.gg/account/signin?token=abc&x="y"');
    expect(mail.text).toContain('https://autotournament.gg/account/signin?token=abc&x="y"');
    expect(mail.html).toContain('token=abc&amp;x=&quot;y&quot;');
    expect(mail.html).not.toContain('x="y"');
  });
});
