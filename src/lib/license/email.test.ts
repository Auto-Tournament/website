import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailConfig, sendEmail, DEFAULT_EMAIL_FROM, POSTMARK_URL } from '../email/postmark';
import { emailLicense } from './deliver';
import { coverageText, formatDay, periodText, updatesText } from './describe';
import { escapeHtml, licenseEmail } from './email';
import { emailHash, type LicensePayload } from './format';
import { createLicenseStore, type LicenseRecord } from './store';

const site = 'https://autotournament.gg';

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    kid: 'kid',
    id: 'L-test',
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
    ...over,
  };
}

const record = (sessionId = 'cs_test_1', over: Partial<LicenseRecord> = {}): LicenseRecord => ({
  session_id: sessionId,
  invoice_number: 'ABCD1234-0001',
  email_sha256: emailHash('buyer@example.com'),
  livemode: false,
  dates_from_form: true,
  payload: payload(),
  token: 'ATL1.payload.sig',
  ...over,
});

const okResponse = () => Response.json({ ErrorCode: 0, Message: 'OK', MessageID: 'msg-1', To: 'buyer@example.com' });

describe('describe', () => {
  it('formats days and periods', () => {
    expect(formatDay('2026-10-03')).toBe('3 October 2026');
    expect(formatDay('soon')).toBe('soon');
    expect(periodText(payload())).toBe('One event, 3 October 2026 to 5 October 2026');
    expect(periodText(payload({ kind: 'year', valid_from: undefined, valid_to: undefined, updates_until: '2027-09-28' }))).toBe(
      'Yearly, 28 September 2026 to 28 September 2027',
    );
    expect(periodText(payload({ kind: 'founder', updates_until: '9999-12-31' }))).toBe('Founding supporter, lifetime updates');
    expect(updatesText({ updates_until: '9999-12-31' })).toBe('For life');
    expect(coverageText({ kind: 'year', updates_until: '2027-09-28' })).toContain('Renew yearly');
  });
});

describe('license email', () => {
  it('has the key, the details and the links', () => {
    const mail = licenseEmail(record(), site);
    expect(mail.subject).toBe('Your Auto Tournament license key — L-test');
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('ATL1.payload.sig');
      expect(body).toContain('Platform L');
      expect(body).toContain('Up to 40 game servers');
      expect(body).toContain('One event, 3 October 2026 to 5 October 2026');
      expect(body).toContain('cs_test_1');
      expect(body).toContain('ABCD1234-0001');
      expect(body).toContain(`${site}/license`);
      expect(body).toContain(`${site}/terms`);
      expect(body).toContain('938 566 674');
    }
  });

  it('leaves out an unknown invoice number', () => {
    const mail = licenseEmail(record('cs_test_1', { invoice_number: null }), site);
    expect(mail.text).not.toContain('Invoice:');
  });

  it('escapes buyer-provided values in the HTML', () => {
    const mail = licenseEmail(record('cs_test_1', { payload: payload({ licensee: '<script>alert("x")</script> & Co' }) }), site);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co');
    expect(mail.text).toContain('<script>alert("x")</script> & Co');
    expect(escapeHtml(`'`)).toBe('&#39;');
  });
});

describe('postmark', () => {
  it('is off without a token', () => {
    expect(emailConfig({})).toBeNull();
    expect(emailConfig({ POSTMARK_SERVER_TOKEN: '  ' })).toBeNull();
    expect(emailConfig({ POSTMARK_SERVER_TOKEN: 't' })).toEqual({ token: 't', from: DEFAULT_EMAIL_FROM, stream: 'outbound' });
    expect(emailConfig({ POSTMARK_SERVER_TOKEN: 't', EMAIL_FROM: 'A <a@b.c>\r\nBcc: x', POSTMARK_MESSAGE_STREAM: 'licenses' })).toEqual({
      token: 't',
      from: 'A <a@b.c> Bcc: x',
      stream: 'licenses',
    });
  });

  it('posts to Postmark with the token header and no tracking', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    const result = await sendEmail({ to: 'buyer@example.com', subject: 's', text: 't', html: 'h' }, { token: 'tok', from: 'f', stream: 'outbound' }, fetchImpl);
    expect(result).toEqual({ ok: true, messageId: 'msg-1' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(POSTMARK_URL);
    expect((init.headers as Record<string, string>)['x-postmark-server-token']).toBe('tok');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ To: 'buyer@example.com', ReplyTo: 'sivert@autotournament.gg', MessageStream: 'outbound', TrackOpens: false, TrackLinks: 'None' });
  });

  it('reports errors without Postmark\'s message (it can quote the address)', async () => {
    const fetchImpl = async () => Response.json({ ErrorCode: 300, Message: "Invalid 'To' address: 'buyer@example.com'." }, { status: 422 });
    const result = await sendEmail({ to: 'buyer@example.com', subject: 's', text: 't', html: 'h' }, { token: 't', from: 'f', stream: 'outbound' }, fetchImpl);
    expect(result).toEqual({ ok: false, error: 'postmark http 422 code 300' });
    const down = await sendEmail({ to: 'x@y.z', subject: 's', text: 't', html: 'h' }, { token: 't', from: 'f', stream: 'outbound' }, async () => {
      throw new TypeError('fetch failed');
    });
    expect(down).toEqual({ ok: false, error: 'network error' });
  });
});

describe('sending the key once', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'licenses-email-'));
    vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token');
    vi.stubEnv('SITE_URL', '');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('claims a license for one send at a time, and not again once emailed', async () => {
    const store = createLicenseStore(dir);
    await store.issueOnce('cs_test_1', async () => record());
    const [a, b] = await Promise.all([store.claimEmail('cs_test_1'), store.claimEmail('cs_test_1')]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    await store.finishEmail('cs_test_1', { ok: false, at: '2026-09-28T10:00:00Z', error: 'postmark http 500' });
    expect((await store.bySession('cs_test_1'))?.email_error).toBe('2026-09-28T10:00:00Z postmark http 500');
    // A failed send can be tried again.
    expect(await store.claimEmail('cs_test_1')).not.toBeNull();
    await store.finishEmail('cs_test_1', { ok: true, at: '2026-09-28T10:01:00Z' });
    expect(await store.claimEmail('cs_test_1')).toBeNull();
    expect(await store.claimEmail('cs_test_nope')).toBeNull();
    // "Email it to me again" may send it again.
    expect(await store.claimEmail('cs_test_1', { again: true })).not.toBeNull();
    await store.finishEmail('cs_test_1', { ok: true, at: '2026-09-28T11:00:00Z' });

    const saved = await createLicenseStore(dir).bySession('cs_test_1');
    expect(saved).toMatchObject({ emailed_at: '2026-09-28T10:01:00Z', email_error: null });
    expect(await readFile(store.file, 'utf8')).not.toContain('buyer@example.com');
  });

  it('webhook, retries and the thanks page together send one email', async () => {
    const store = createLicenseStore(dir);
    await store.issueOnce('cs_test_1', async () => record());
    const fetchImpl = vi.fn(async () => okResponse());
    const results = await Promise.all([
      emailLicense('cs_test_1', 'Buyer@Example.com', { store, fetchImpl }),
      emailLicense('cs_test_1', 'buyer@example.com', { store, fetchImpl }),
      emailLicense('cs_test_1', 'buyer@example.com', { store, fetchImpl }),
    ]);
    expect(results.sort()).toEqual(['sent', 'skipped', 'skipped']);
    expect(await emailLicense('cs_test_1', 'buyer@example.com', { store, fetchImpl })).toBe('skipped');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await store.bySession('cs_test_1'))?.emailed_at).toBeTruthy();
  });

  it('a failed send is recorded, logged without the address, and sent on the next try', async () => {
    const store = createLicenseStore(dir);
    await store.issueOnce('cs_test_1', async () => record());
    const failing = vi.fn(async () => Response.json({ ErrorCode: 406, Message: 'buyer@example.com is inactive' }, { status: 422 }));
    expect(await emailLicense('cs_test_1', 'buyer@example.com', { store, fetchImpl: failing })).toBe('failed');
    const logged = JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.info).mock.calls]);
    expect(logged).not.toContain('buyer@example.com');
    expect((await store.bySession('cs_test_1'))?.email_error).toContain('code 406');

    const fetchImpl = vi.fn(async () => okResponse());
    expect(await emailLicense('cs_test_1', 'buyer@example.com', { store, fetchImpl })).toBe('sent');
  });

  it('never sends to an address the license was not bought with', async () => {
    const store = createLicenseStore(dir);
    await store.issueOnce('cs_test_1', async () => record());
    const fetchImpl = vi.fn(async () => okResponse());
    expect(await emailLicense('cs_test_1', 'someone@else.com', { store, fetchImpl, again: true })).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is off without POSTMARK_SERVER_TOKEN', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
    const store = createLicenseStore(dir);
    await store.issueOnce('cs_test_1', async () => record());
    const fetchImpl = vi.fn(async () => okResponse());
    expect(await emailLicense('cs_test_1', 'buyer@example.com', { store, fetchImpl })).toBe('disabled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
