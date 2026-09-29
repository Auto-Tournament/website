import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CHECKIN_RULES, checkinAnswer, customerNotice, instanceLabel, parseCheckin, sameToken, usageFor, verifiedPayload, type InstanceRow } from './checkin';
import { signingKeyFrom, signLicense, type LicensePayload } from './format';

function key() {
  const { privateKey } = generateKeyPairSync('ed25519');
  return signingKeyFrom(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
}

const k = key();
const year: LicensePayload = {
  v: 1,
  kid: k.kid,
  id: 'L-abcdef123456',
  customer: 'cus_X',
  product: 'platform',
  pack: 'M',
  max_servers: 20,
  kind: 'year',
  issued_at: '2026-09-01T10:00:00Z',
  updates_until: '2027-09-01',
};
const event: LicensePayload = { ...year, id: 'L-event1234567', kind: 'event', updates_until: '2026-10-04', valid_from: '2026-10-03', valid_to: '2026-10-04' };
const token = signLicense(year, k);
const instance = '6f1c1e0a-3b7e-4c1a-9d2e-0b9f8a7c6d5e';

const body = {
  token,
  key_id: year.id,
  instance_id: instance,
  server_count: 12,
  platform_version: '1.4.0',
  sent_at: '2026-09-29T10:00:00Z',
};

describe('parseCheckin', () => {
  it('accepts the documented body and defaults the optional counts', () => {
    const r = parseCheckin(body);
    expect(r).toEqual({
      ok: true,
      value: { token, keyId: year.id, instanceId: instance, serverCount: 12, platformVersion: '1.4.0', matchesPlayed: 0, tournamentsLive: 0, maxTournamentTeams: 0, declared: 'none' },
    });
  });

  it('takes the activity counts and the answer', () => {
    const r = parseCheckin({ ...body, matches_played: 5, tournaments_live: 1, max_tournament_teams: 8, declared: 'testing' });
    expect(r.ok && r.value).toMatchObject({ matchesPlayed: 5, tournamentsLive: 1, maxTournamentTeams: 8, declared: 'testing' });
  });

  it.each([
    ['token', { token: 'nope' }],
    ['key_id', { key_id: 'x' }],
    ['instance_id', { instance_id: 'not-a-uuid' }],
    ['server_count', { server_count: -1 }],
    ['server_count', { server_count: 1.5 }],
    ['platform_version', { platform_version: '<script>' }],
    ['sent_at', { sent_at: 'yesterday' }],
    ['counts', { matches_played: 'many' }],
    ['declared', { declared: 'whatever' }],
  ])('refuses a bad %s', (_, patch) => {
    expect(parseCheckin({ ...body, ...patch }).ok).toBe(false);
  });

  it('refuses a non-object', () => {
    expect(parseCheckin(null).ok).toBe(false);
    expect(parseCheckin([body]).ok).toBe(false);
  });
});

describe('verifiedPayload', () => {
  const keys = { [k.kid]: k.publicJwk };

  it('returns the payload of a genuine key', () => {
    expect(verifiedPayload(token, keys)?.id).toBe(year.id);
  });

  it('refuses an unknown signing key, a changed payload and junk', () => {
    expect(verifiedPayload(token, {})).toBeNull();
    const [p, body64, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...year, max_servers: 999 })).toString('base64url');
    expect(verifiedPayload(`${p}.${forged}.${sig}`, keys)).toBeNull();
    expect(verifiedPayload(`${p}.${body64}`, keys)).toBeNull();
    expect(verifiedPayload('ATL1.!!.??', keys)).toBeNull();
    const other = key();
    expect(verifiedPayload(signLicense({ ...year, kid: other.kid }, other), keys)).toBeNull();
  });
});

describe('helpers', () => {
  it('sameToken compares exactly', () => {
    expect(sameToken('abc', 'abc')).toBe(true);
    expect(sameToken('abc', 'abd')).toBe(false);
    expect(sameToken('abc', 'abcd')).toBe(false);
  });
  it('instanceLabel is 8 stable hex characters, not the id', () => {
    expect(instanceLabel(instance)).toMatch(/^[0-9a-f]{8}$/);
    expect(instanceLabel(instance)).toBe(instanceLabel(instance));
    expect(instance.startsWith(instanceLabel(instance))).toBe(false);
  });
});

const now = new Date('2026-10-20T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60_000);
const row = (id: string, lastSeen: Date, serverCount: number, declared: InstanceRow['declared'] = 'none'): InstanceRow => ({
  instanceId: id,
  firstSeen: daysAgo(40),
  lastSeen,
  serverCount,
  platformVersion: '1.4.0',
  declared,
});

describe('usageFor: servers', () => {
  it('one instance within the pack is fine', () => {
    const u = usageFor(year, [row('a', daysAgo(0.5), 20)], [], now);
    expect(u).toMatchObject({ activeInstances: 1, activeServers: 20, overServers: false, emailReason: null });
    expect(customerNotice(year, u, 'https://x/pricing')).toBeNull();
  });

  it('active instances together above the pack', () => {
    const u = usageFor(year, [row('a', daysAgo(0.5), 12), row('b', daysAgo(1), 12)], [], now);
    expect(u).toMatchObject({ activeInstances: 2, activeServers: 24, overServers: true, emailReason: 'servers' });
    const notice = customerNotice(year, u, 'https://x/pricing') ?? '';
    expect(notice).toContain('2 instances with 24 servers');
    expect(notice).not.toMatch(/reuse|violation|cheat|flag|overuse/i);
  });

  it('an instance not seen for a few days (a reinstall) no longer counts, but is listed for 30 days', () => {
    const u = usageFor(year, [row('new', daysAgo(0.2), 15), row('old', daysAgo(CHECKIN_RULES.activeDays + 1), 15), row('gone', daysAgo(31), 15)], [], now);
    expect(u.instances.map((i) => i.instanceId)).toEqual(['new', 'old']);
    expect(u).toMatchObject({ activeInstances: 1, activeServers: 15, windowServers: 30, overServers: false });
  });
});

describe('usageFor: event dates', () => {
  const inside = { day: '2026-10-04', matches: 40, tournaments: 1, maxTeams: 16 };

  it('the event itself, and the check-in the morning after, are fine', () => {
    const u = usageFor(event, [row('a', daysAgo(0.5), 10)], [inside, { day: '2026-10-05', matches: 10, tournaments: 1, maxTeams: 16 }], now);
    expect(u.outsideDates).toBe(false);
  });

  it('light testing before or after the dates is ignored', () => {
    const u = usageFor(event, [row('a', daysAgo(0.5), 10)], [{ day: '2026-09-28', matches: 2, tournaments: 0, maxTeams: 0 }], now);
    expect(u.outsideDates).toBe(false);
  });

  it('a tournament outside the dates is noted for the customer, without an email (testing is assumed)', () => {
    const u = usageFor(event, [row('a', daysAgo(0.5), 10)], [{ day: '2026-10-15', matches: 6, tournaments: 1, maxTeams: 4 }], now);
    expect(u).toMatchObject({ outsideDates: true, fullEventOutside: false, emailReason: null });
    const notice = customerNotice(event, u, 'https://x/pricing') ?? '';
    expect(notice).toContain('Planning something new? This event license covers 2026-10-03 to 2026-10-04.');
    expect(notice).toContain('No action needed while you');
    expect(notice).not.toMatch(/reuse|violation|cheat|flag|overuse/i);
  });

  it('a whole event outside the dates gets an email, even when they said testing', () => {
    const days = [{ day: '2026-10-17', matches: 30, tournaments: 1, maxTeams: 16 }];
    expect(usageFor(event, [row('a', daysAgo(0.5), 10, 'testing')], days, now).emailReason).toBe('event-dates');
    expect(usageFor(event, [row('a', daysAgo(0.5), 10)], [{ day: '2026-10-17', matches: 7, tournaments: 1, maxTeams: CHECKIN_RULES.fullEventTeams }], now).emailReason).toBe('event-dates');
  });

  it('…but not when they said the dates moved', () => {
    const days = [{ day: '2026-10-17', matches: 30, tournaments: 1, maxTeams: 16 }];
    const u = usageFor(event, [row('a', daysAgo(0.5), 10, 'dates_moved')], days, now);
    expect(u).toMatchObject({ outsideDates: true, fullEventOutside: true, declared: 'dates_moved', emailReason: null });
  });

  it('adds up the instances per day', () => {
    const days = [
      { day: '2026-10-15', matches: 2, tournaments: 0, maxTeams: 0 },
      { day: '2026-10-15', matches: 2, tournaments: 0, maxTeams: 0 },
    ];
    expect(usageFor(event, [row('a', daysAgo(0.5), 1), row('b', daysAgo(0.5), 1)], days, now).outsideDates).toBe(true);
  });

  it('year and founder licenses only have the server rule', () => {
    const u = usageFor(year, [row('a', daysAgo(0.5), 1)], [{ day: '2026-10-15', matches: 99, tournaments: 3, maxTeams: 32 }], now);
    expect(u).toMatchObject({ outsideDates: false, emailReason: null });
  });
});

describe('checkinAnswer', () => {
  it('is the documented shape', () => {
    const u = usageFor(year, [row('a', daysAgo(0.5), 12)], [], now);
    expect(checkinAnswer(year, u, 'https://x/pricing')).toEqual({
      ok: true,
      usage: { instances: 1, servers: 12, max_servers: 20, window_days: 30, overuse: false, outside_dates: false },
      notice: null,
    });
  });
});
