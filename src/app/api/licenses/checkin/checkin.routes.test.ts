import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { POST } from './route';
import { setDb } from '@/lib/db/client';
import { testDb } from '@/lib/db/testing';
import { licenseCheckinDays, licenseCheckins, licenseUsageAlerts } from '@/lib/db/schema';
import { issueForSession } from '@/lib/license/issue';
import { claimUsageEmail, pruneCheckins } from '@/lib/license/checkinStore';
import { signingKeyFrom, signLicense } from '@/lib/license/format';
import { pruneExpired } from '@/lib/db/prune';

let t: Awaited<ReturnType<typeof testDb>>;
let ipCounter = 0;

beforeEach(async () => {
  t = await testDb();
  setDb(t.db);
  const { privateKey } = generateKeyPairSync('ed25519');
  vi.stubEnv('LICENSE_SIGNING_KEY', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
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

function session(id: string, metadata: Record<string, string>): Stripe.Checkout.Session {
  return {
    id,
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    created: 1_790_000_000,
    livemode: true,
    customer: 'cus_BUYER12345',
    customer_details: { email: 'buyer@example.com', business_name: 'Example LAN AS' },
    metadata,
    custom_fields: [],
    invoice: null,
  } as unknown as Stripe.Checkout.Session;
}

async function issue(id: string, metadata: Record<string, string>) {
  const r = await issueForSession(session(id, metadata), new Date('2026-09-28T10:00:00Z'));
  if (r.status !== 'issued') throw new Error('not issued');
  return r.record;
}

function post(body: unknown, init: { raw?: string; contentType?: string } = {}) {
  ipCounter += 1;
  return POST(
    new Request('http://localhost/api/licenses/checkin', {
      method: 'POST',
      headers: { 'content-type': init.contentType ?? 'application/json', 'x-forwarded-for': `10.20.${Math.floor(ipCounter / 250)}.${ipCounter % 250}` },
      body: init.raw ?? JSON.stringify(body),
    }),
  );
}

const instanceA = '6f1c1e0a-3b7e-4c1a-9d2e-0b9f8a7c6d5e';
const instanceB = '7a2d2f1b-4c8f-4d2b-8e3f-1c0a9b8d7e6f';

function checkin(token: string, keyId: string, patch: Record<string, unknown> = {}) {
  return { token, key_id: keyId, instance_id: instanceA, server_count: 10, platform_version: '1.4.0', sent_at: new Date().toISOString(), ...patch };
}

describe('POST /api/licenses/checkin', () => {
  it('records a genuine key and answers with its usage; the key itself is not stored', async () => {
    const lic = await issue('cs_live_year', { pack: 'platform-m', period: 'year', max_servers: '20' });
    const res = await post(checkin(lic.token, lic.payload.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      usage: { instances: 1, servers: 10, max_servers: 20, window_days: 30, overuse: false, outside_dates: false },
      notice: null,
    });
    const rows = await t.db.select().from(licenseCheckins);
    expect(rows).toEqual([expect.objectContaining({ licenseId: lic.payload.id, instanceId: instanceA, serverCount: 10, platformVersion: '1.4.0', declared: 'none' })]);
    expect(JSON.stringify(rows)).not.toContain(lic.token);
  });

  it('a second instance above the pack gets a calm notice, and one internal note a day', async () => {
    const lic = await issue('cs_live_year2', { pack: 'platform-m', period: 'year', max_servers: '20' });
    await post(checkin(lic.token, lic.payload.id, { server_count: 12 }));
    const res = await post(checkin(lic.token, lic.payload.id, { instance_id: instanceB, server_count: 12 }));
    const body = await res.json();
    expect(body.usage).toMatchObject({ instances: 2, servers: 24, overuse: true });
    expect(body.notice).toContain('set up on 2 instances with 24 servers');
    // The internal note is claimed once per license per day.
    await vi.waitFor(async () => expect(await t.db.select().from(licenseUsageAlerts)).toHaveLength(1));
    expect(await claimUsageEmail(t.db, lic.payload.id, 'servers')).toBe(false);
  });

  it('an event key used for a tournament outside its dates gets the "planning something new?" note', async () => {
    const lic = await issue('cs_live_event', { pack: 'platform-s', period: 'event', max_servers: '10', eventdates: '2026-10-03/2026-10-04' });
    expect(lic.payload.valid_from).toBe('2026-10-03');
    const res = await post(checkin(lic.token, lic.payload.id, { matches_played: 5, tournaments_live: 1, max_tournament_teams: 4 }));
    const body = await res.json();
    expect(body.usage.outside_dates).toBe(true);
    expect(body.notice).toContain('Planning something new?');
    const days = await t.db.select().from(licenseCheckinDays);
    expect(days).toEqual([expect.objectContaining({ matches: 5, tournaments: 1, maxTeams: 4 })]);
    // Testing is assumed: no internal note for a small tournament.
    expect(await t.db.select().from(licenseUsageAlerts)).toHaveLength(0);
  });

  it('refuses a key we did not issue, even with a valid signature', async () => {
    const lic = await issue('cs_live_other', { pack: 'platform-m', period: 'year', max_servers: '20' });
    const signing = signingKeyFrom(process.env.LICENSE_SIGNING_KEY as string);
    const forged = signLicense({ ...lic.payload, max_servers: 500 }, signing);
    expect((await post(checkin(forged, lic.payload.id))).status).toBe(404);
    const unknown = signLicense({ ...lic.payload, id: 'L-notissued99' }, signing);
    expect((await post(checkin(unknown, 'L-notissued99'))).status).toBe(404);
    expect(await t.db.select().from(licenseCheckins)).toHaveLength(0);
  });

  it('refuses a bad signature, a key id that does not match, and bad bodies', async () => {
    const lic = await issue('cs_live_bad', { pack: 'platform-m', period: 'year', max_servers: '20' });
    const [p, b] = lic.token.split('.');
    expect((await post(checkin(`${p}.${b}.AAAA`, lic.payload.id))).status).toBe(401);
    expect((await post(checkin(lic.token, 'L-someoneelse1'))).status).toBe(401);
    expect((await post(checkin(lic.token, lic.payload.id, { instance_id: 'x' }))).status).toBe(400);
    expect((await post(null, { raw: '{nope' })).status).toBe(400);
    expect((await post(null, { raw: '{}', contentType: 'text/plain' })).status).toBe(415);
    expect((await post(null, { raw: JSON.stringify({ pad: 'x'.repeat(9000) }) })).status).toBe(413);
  });

  it('rate-limits one instance of one key', async () => {
    const lic = await issue('cs_live_rl', { pack: 'platform-m', period: 'year', max_servers: '20' });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) statuses.push((await post(checkin(lic.token, lic.payload.id, { instance_id: 'aaaaaaaa-1111-4111-8111-111111111111' }))).status);
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(6)).toEqual([429, 429]);
  });

  it('check-ins are deleted 90 days after the instance was last seen', async () => {
    const lic = await issue('cs_live_prune', { pack: 'platform-m', period: 'year', max_servers: '20' });
    await post(checkin(lic.token, lic.payload.id, { matches_played: 1 }));
    expect(await pruneCheckins(t.db, new Date(Date.now() + 89 * 24 * 60 * 60_000))).toBe(0);
    expect((await pruneExpired(t.db, new Date(Date.now() + 92 * 24 * 60 * 60_000))).licenseCheckins).toBe(2);
    expect(await t.db.select().from(licenseCheckins)).toHaveLength(0);
  });
});
