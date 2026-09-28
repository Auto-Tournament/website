import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyLicense } from '../../../scripts/license-verify.mjs';
import {
  addMonths,
  checkSession,
  emailHash,
  kidFor,
  licenseDates,
  parseEventDates,
  payloadForSession,
  signLicense,
  signingKeyFrom,
  type LicensePayload,
  type SessionLike,
  type SigningKey,
} from './format';
import { testDb } from '../db/testing';
import { licenses } from '../db/schema';
import { createLicenseStore, importLicenseFile, type LicenseRecord } from './store';

/** A throwaway key made for this test run; nothing is committed. */
function throwawayKey(): SigningKey {
  const { privateKey } = generateKeyPairSync('ed25519');
  return signingKeyFrom(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
}

const key = throwawayKey();
const publicKeys = { [key.kid]: key.publicJwk };

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    kid: key.kid,
    id: 'L-test',
    customer: 'cus_TEST123',
    licensee: 'Example LAN AS',
    product: 'servers',
    pack: 'M',
    max_servers: 15,
    kind: 'year',
    issued_at: '2026-10-01T12:00:00Z',
    updates_until: '2027-10-01',
    ...over,
  };
}

function session(over: Partial<SessionLike> = {}): SessionLike {
  return {
    id: 'cs_test_abcdefghijklmnop',
    status: 'complete',
    payment_status: 'paid',
    created: 1_790_000_000,
    customer: 'cus_TEST123',
    customer_details: { email: 'Buyer@Example.com', business_name: 'Example LAN AS' },
    collected_information: { business_name: 'Example LAN AS' },
    metadata: { pack: 'platform-l', period: 'event', servers: '34', tools: 'platform', max_servers: '40' },
    custom_fields: [{ key: 'eventdates', text: { value: '3-5 October 2026' } }],
    ...over,
  };
}

describe('dates', () => {
  it('reads the usual ways to write event dates', () => {
    expect(parseEventDates('2026-10-03 to 2026-10-05')).toEqual({ start: '2026-10-03', end: '2026-10-05' });
    expect(parseEventDates('3.10.2026 - 5.10.2026')).toEqual({ start: '2026-10-03', end: '2026-10-05' });
    expect(parseEventDates('3-5 October 2026')).toEqual({ start: '2026-10-03', end: '2026-10-05' });
    expect(parseEventDates('October 3–5, 2026')).toEqual({ start: '2026-10-03', end: '2026-10-05' });
    expect(parseEventDates('3. okt 2026')).toEqual({ start: '2026-10-03', end: '2026-10-03' });
    expect(parseEventDates('next autumn')).toBeNull();
    expect(parseEventDates('31.02.2026')).toBeNull();
  });

  it('adds months without overflowing short months', () => {
    expect(addMonths('2026-10-01', 12)).toBe('2027-10-01');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
  });

  it('event: the form dates, capped at 5 days; updates until the last day', () => {
    expect(licenseDates('event', '2026-09-28', '2026-10-03 to 2026-10-12')).toEqual({
      updates_until: '2026-10-07',
      valid_from: '2026-10-03',
      valid_to: '2026-10-07',
      fromForm: true,
    });
    expect(licenseDates('event', '2026-09-28', 'soon')).toEqual({
      updates_until: '2026-10-02',
      valid_from: '2026-09-28',
      valid_to: '2026-10-02',
      fromForm: false,
    });
    // Implausible (years away): counted from the purchase instead.
    expect(licenseDates('event', '2026-09-28', '2030-01-01').fromForm).toBe(false);
  });

  it('year: updates 12 months from the purchase, no end to the rights', () => {
    expect(licenseDates('year', '2026-09-28', '2026-10-15')).toEqual({ updates_until: '2027-09-28', fromForm: false });
  });

  it('founder: lifetime updates, no period', () => {
    expect(licenseDates('founder', '2026-09-28', undefined)).toEqual({ updates_until: '9999-12-31', fromForm: false });
  });
});

describe('checkout session → payload', () => {
  it('accepts only paid license sessions', () => {
    expect(checkSession(session())).toEqual({ ok: true, packId: 'platform-l', kind: 'event', metadataMaxServers: 40 });
    expect(checkSession(session({ payment_status: 'unpaid' }))).toEqual({ ok: false, reason: 'not_paid' });
    expect(checkSession(session({ status: 'open' }))).toEqual({ ok: false, reason: 'not_paid' });
    expect(checkSession(session({ metadata: {} }))).toEqual({ ok: false, reason: 'not_license' });
    expect(checkSession(session({ metadata: { pack: 'platform-xl', period: 'event' } }))).toEqual({ ok: false, reason: 'not_license' });
  });

  it('builds the payload', () => {
    const { payload: p, datesFromForm } = payloadForSession(session(), {
      kid: key.kid,
      id: 'L-1',
      packId: 'platform-l',
      kind: 'event',
      maxServers: 40,
      now: new Date('2026-09-28T10:11:12.345Z'),
    });
    expect(datesFromForm).toBe(true);
    expect(p).toEqual({
      v: 1,
      kid: key.kid,
      id: 'L-1',
      customer: 'cus_TEST123',
      licensee: 'Example LAN AS',
      product: 'platform',
      pack: 'L',
      max_servers: 40,
      kind: 'event',
      issued_at: '2026-09-28T10:11:12Z',
      updates_until: '2026-10-05',
      valid_from: '2026-10-03',
      valid_to: '2026-10-05',
    });
    // No email in the key.
    expect(JSON.stringify(p)).not.toContain('@');
  });

  it('falls back to the email when there is no Stripe customer', () => {
    const { payload: p } = payloadForSession(session({ customer: null }), {
      kid: key.kid,
      id: 'L-2',
      packId: 'servers-s',
      kind: 'founder',
      maxServers: 5,
      now: new Date('2026-09-28T00:00:00Z'),
    });
    expect(p.customer).toBe('buyer@example.com');
    expect(p.updates_until).toBe('9999-12-31');
    expect(p.valid_from).toBeUndefined();
  });
});

describe('signing and verifying', () => {
  it('derives the kid from the public key', () => {
    expect(key.kid).toBe(kidFor(key.publicJwk));
    expect(key.kid).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it('a fresh key verifies with no warnings', () => {
    const token = signLicense(payload(), key);
    expect(token).toMatch(/^ATL1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const r = verifyLicense(token, { publicKeys, lineDate: '2027-03-01', serverCount: 10, now: '2027-03-01' });
    expect(r).toMatchObject({ valid: true, status: 'ok', warnings: [] });
    expect(r.license).toEqual(payload());
  });

  it('a tampered payload is invalid', () => {
    const token = signLicense(payload(), key);
    const [prefix, body, sig] = token.split('.');
    const changed = Buffer.from(JSON.stringify({ ...payload(), max_servers: 999 })).toString('base64url');
    expect(changed).not.toBe(body);
    const r = verifyLicense(`${prefix}.${changed}.${sig}`, { publicKeys });
    expect(r).toMatchObject({ valid: false, status: 'invalid', license: null });
    expect(r.warnings.map((w) => w.code)).toEqual(['bad_signature']);
  });

  it('a flipped signature byte is invalid', () => {
    const token = signLicense(payload(), key);
    const sig = Buffer.from(token.split('.')[2], 'base64url');
    sig[0] ^= 1;
    const r = verifyLicense(`${token.split('.').slice(0, 2).join('.')}.${sig.toString('base64url')}`, { publicKeys });
    expect(r.warnings[0].code).toBe('bad_signature');
  });

  it('a key signed by another (unknown) kid is invalid', () => {
    const other = throwawayKey();
    const token = signLicense(payload({ kid: other.kid }), other);
    const r = verifyLicense(token, { publicKeys });
    expect(r).toMatchObject({ valid: false, status: 'invalid' });
    expect(r.warnings[0].code).toBe('unknown_kid');
  });

  it("a kid pointing at a different key's public key is invalid", () => {
    const other = throwawayKey();
    const token = signLicense(payload({ kid: other.kid }), other);
    const r = verifyLicense(token, { publicKeys: { [other.kid]: key.publicJwk } });
    expect(r.warnings[0].code).toBe('bad_signature');
  });

  it('a release line newer than updates_until only warns', () => {
    const token = signLicense(payload({ updates_until: '2027-10-01' }), key);
    const r = verifyLicense(token, { publicKeys, lineDate: '2027-11-15', now: '2028-01-01' });
    expect(r.valid).toBe(true);
    expect(r.status).toBe('warning');
    expect(r.status).not.toBe('blocked');
    expect(r.warnings.map((w) => w.code)).toEqual(['updates_expired']);
    // A later patch of a covered line (line date inside updates) is covered, even after the updates end.
    expect(verifyLicense(token, { publicKeys, lineDate: '2027-09-01', now: '2028-06-01' }).status).toBe('ok');
    // The last covered day is inclusive.
    expect(verifyLicense(token, { publicKeys, lineDate: '2027-10-01' }).status).toBe('ok');
  });

  it('too many servers, the event window and the wrong product only warn', () => {
    const token = signLicense(payload({ kind: 'event', updates_until: '2026-10-05', valid_from: '2026-10-03', valid_to: '2026-10-05' }), key);
    const r = verifyLicense(token, { publicKeys, lineDate: '2026-09-01', now: '2026-10-09', serverCount: 20, product: 'platform' });
    expect(r).toMatchObject({ valid: true, status: 'warning' });
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['period_ended', 'too_many_servers', 'wrong_product']);
    expect(verifyLicense(token, { publicKeys, lineDate: '2026-09-01', now: '2026-10-01' }).warnings.map((w) => w.code)).toEqual(['period_not_started']);
  });

  it('founder keys cover every release line', () => {
    const token = signLicense(payload({ kind: 'founder', updates_until: '9999-12-31' }), key);
    expect(verifyLicense(token, { publicKeys, lineDate: '2040-01-01', now: '2041-01-01' }).status).toBe('ok');
  });

  it('garbage and other versions are invalid, never thrown', () => {
    for (const bad of ['', 'hello', 'ATL1..', 'ATL2.a.b', `ATL1.${'a'.repeat(5000)}.b`, 'ATL1.!!!.???']) {
      const r = verifyLicense(bad, { publicKeys });
      expect(r).toMatchObject({ valid: false, status: 'invalid' });
    }
    const v2 = Buffer.from(JSON.stringify({ ...payload(), v: 2 })).toString('base64url');
    expect(verifyLicense(`ATL1.${v2}.${'A'.repeat(86)}`, { publicKeys }).warnings[0].code).toBe('unsupported_version');
  });

  it('a signed but incomplete payload is invalid', () => {
    const token = signLicense({ ...payload(), max_servers: 0 }, key);
    expect(verifyLicense(token, { publicKeys }).warnings[0].code).toBe('malformed');
  });

  it('refuses to sign with a key the kid does not name', () => {
    expect(() => signLicense(payload({ kid: 'nope' }), key)).toThrow();
  });
});

describe('store', () => {
  let t: Awaited<ReturnType<typeof testDb>>;
  beforeEach(async () => {
    t = await testDb();
  });
  afterEach(async () => {
    await t.close();
  });

  const record = (sessionId: string, token = 'ATL1.x.y'): LicenseRecord => ({
    session_id: sessionId,
    invoice_number: 'ABCD1234-0001',
    email_sha256: emailHash('buyer@example.com'),
    livemode: false,
    dates_from_form: true,
    payload: { ...payload(), id: `L-${sessionId}` },
    token,
  });

  it('issues one key per session, even when asked twice at once', async () => {
    const store = createLicenseStore(t.db);
    let made = 0;
    const create = async () => {
      made++;
      return record('cs_test_1', `ATL1.${made}.x`);
    };
    const [a, b] = await Promise.all([store.issueOnce('cs_test_1', create), store.issueOnce('cs_test_1', create)]);
    expect(made).toBe(1);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.record.token).toBe(b.record.token);

    // Another store on the same database reads the same key back.
    const again = createLicenseStore(t.db);
    expect((await again.bySession('cs_test_1'))?.token).toBe('ATL1.1.x');
    expect((await again.issueOnce('cs_test_1', create)).created).toBe(false);
    expect(made).toBe(1);
  });

  it('counts only live founder licenses for the founder cap', async () => {
    const store = createLicenseStore(t.db);
    const make = (id: string, kind: 'founder' | 'year', livemode: boolean) => async () => ({
      ...record(id),
      livemode,
      payload: { ...record(id).payload, kind },
    });
    await store.issueOnce('cs_live_f1', make('cs_live_f1', 'founder', true));
    await store.issueOnce('cs_live_f2', make('cs_live_f2', 'founder', true));
    await store.issueOnce('cs_test_f', make('cs_test_f', 'founder', false));
    await store.issueOnce('cs_live_y', make('cs_live_y', 'year', true));
    expect(await store.founderCount()).toBe(2);
  });

  it('keeps a hash of the email, never the email', async () => {
    const store = createLicenseStore(t.db);
    await store.issueOnce('cs_test_2', async () => record('cs_test_2'));
    const rows = await t.db.select().from(licenses);
    expect(JSON.stringify(rows)).not.toContain('buyer@example.com');
    expect(rows[0].emailHash).toBe(emailHash('buyer@example.com'));
  });

  it('finds a key by session id or invoice number, only with the right email', async () => {
    const store = createLicenseStore(t.db);
    await store.issueOnce('cs_test_3', async () => record('cs_test_3'));
    const hash = emailHash(' Buyer@Example.COM ');
    expect((await store.find('cs_test_3', hash))?.session_id).toBe('cs_test_3');
    expect((await store.find('abcd1234-0001', hash))?.session_id).toBe('cs_test_3');
    expect(await store.find('cs_test_3', emailHash('someone@else.com'))).toBeNull();
    expect(await store.find('cs_test_nope', hash)).toBeNull();
    expect((await store.byLicenseId('L-cs_test_3'))?.session_id).toBe('cs_test_3');
    expect((await store.forEmail(hash)).map((r) => r.session_id)).toEqual(['cs_test_3']);
  });

  it('does not write when creating fails', async () => {
    const store = createLicenseStore(t.db);
    await expect(
      store.issueOnce('cs_test_4', async () => {
        throw new Error('stripe down');
      }),
    ).rejects.toThrow('stripe down');
    expect(await store.bySession('cs_test_4')).toBeNull();
    expect((await store.issueOnce('cs_test_4', async () => record('cs_test_4'))).created).toBe(true);
  });

  it('imports licenses.json once, leaves the file as it was, and keeps what the database has', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'licenses-'));
    try {
      const file = path.join(dir, 'licenses.json');
      const old = [
        { ...record('cs_live_a'), livemode: true, emailed_at: '2026-09-20T10:00:00.000Z', email_error: null },
        { ...record('cs_live_b'), invoice_number: null },
      ];
      const text = `${JSON.stringify({ version: 1, licenses: old }, null, 1)}\n`;
      await writeFile(file, text, { mode: 0o600 });
      const store = createLicenseStore(t.db);
      expect(await importLicenseFile(store, dir)).toEqual({ inFile: 2, imported: 2 });
      expect(await importLicenseFile(store, dir)).toEqual({ inFile: 2, imported: 0 });
      expect(await readFile(file, 'utf8')).toBe(text);
      expect(await store.bySession('cs_live_a')).toMatchObject({ livemode: true, emailed_at: '2026-09-20T10:00:00.000Z', token: 'ATL1.x.y' });
      expect(await store.founderCount()).toBe(0);
      // No file: nothing to do. A broken file: an error, never a silent start-over.
      expect(await importLicenseFile(store, path.join(dir, 'nope'))).toBeNull();
      await writeFile(file, '{"version":2}');
      await expect(importLicenseFile(store, dir)).rejects.toThrow('not a license store');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
