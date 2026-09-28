import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/checkout/details against a fake Stripe client: what our custom
// form's extra fields do to the session, and what they can never do.

const retrieve = vi.fn();
const update = vi.fn();

vi.mock('stripe', async (importOriginal) => {
  const actual = (await importOriginal()) as { default: { errors: unknown } };
  class FakeStripe {
    static errors = actual.default.errors;
    checkout = { sessions: { retrieve, update } };
  }
  return { default: FakeStripe };
});

const { POST } = await import('./route');

let ip = 0;
function post(body: unknown, contentType = 'application/json') {
  ip++;
  return POST(
    new Request('http://localhost/api/checkout/details', {
      method: 'POST',
      headers: { 'content-type': contentType, 'cf-connecting-ip': `198.51.100.${ip}` },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const details = {
  sessionId: 'cs_test_a1b2c3d4e5f6g7h8',
  company: 'Example LAN AS',
  eventName: 'Example LAN, examplelan.no',
  eventDates: '3-5 October 2026',
  vatId: 'NO123456789MVA',
  business: true,
  terms: true,
};
const openSession = { id: details.sessionId, status: 'open', ui_mode: 'elements', metadata: { pack: 'platform-m', period: 'year', max_servers: '20' } };

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_routeTestKey');
  retrieve.mockReset().mockResolvedValue(openSession);
  update.mockReset().mockResolvedValue({});
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('POST /api/checkout/details', () => {
  it('writes our fields to the session metadata, with the server time of terms acceptance', async () => {
    const res = await post(details);
    expect(res.status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith(details.sessionId);
    expect(update).toHaveBeenCalledWith(details.sessionId, {
      metadata: {
        company: 'Example LAN AS',
        eventname: 'Example LAN, examplelan.no',
        eventdates: '3-5 October 2026',
        buyertype: 'business',
        vat_id: 'NO123456789MVA',
        terms_accepted_at: '2026-09-29T12:00:00.000Z',
      },
    });
  });

  it('only sends metadata: never line items, prices or the session-creation keys', async () => {
    await post(details);
    const params = update.mock.calls[0][1];
    expect(Object.keys(params)).toEqual(['metadata']);
    for (const key of ['pack', 'period', 'servers', 'tools', 'founder', 'max_servers']) expect(params.metadata).not.toHaveProperty(key);
  });

  it('refuses a session that is paid, expired, hosted or not ours', async () => {
    for (const s of [
      { ...openSession, status: 'complete' },
      { ...openSession, status: 'expired' },
      { ...openSession, ui_mode: 'hosted_page' },
      { ...openSession, metadata: {} },
    ]) {
      retrieve.mockResolvedValueOnce(s);
      expect((await post(details)).status).toBe(409);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('validates before calling Stripe: missing terms, extra keys, bad JSON, wrong content type', async () => {
    const res = await post({ ...details, terms: false });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: 'terms' });
    expect((await post({ ...details, pack: 'platform-xl' })).status).toBe(400);
    expect((await post('{nope')).status).toBe(400);
    expect((await post(details, 'text/plain')).status).toBe(400);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('answers 503 without the secret key', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect((await post(details)).status).toBe(503);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('answers 502 when Stripe fails, without the error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    update.mockRejectedValueOnce(new Error('boom sk_test_x'));
    const res = await post(details);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('sk_test');
  });
});
