/**
 * The license check-in (POST /api/licenses/checkin): what a licensed
 * instance sends once a day, how it is checked, and what the usage means.
 * Pure apart from node:crypto, so it is easy to test; the database side is
 * ./checkinStore.ts.
 *
 * Only instances with a license key saved check in. They send the key (so
 * we can check its signature; the key itself is never stored, only its id),
 * a random instance id the instance made for itself, the number of game
 * servers, the platform version, and for the time since the last check-in
 * the number of finished matches, of tournaments with activity and the
 * largest of those in teams. No names, no ids of anything else, no host
 * names. Nothing here ever blocks: the answer is information for the
 * instance to show, and a note for us.
 *
 * Every threshold is in CHECKIN_RULES, and the privacy policy
 * (/privacy#license-checkin) quotes them from there.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import type { CheckinDeclared } from '../db/schema';
import { addDays } from './dates';
import { TOKEN_PREFIX, type LicensePayload, type PublicJwk } from './format';
import { LICENSE_ID } from './verify';

export const CHECKIN_RULES = {
  /** Check-in rows (and the daily activity counts) are deleted this long after the instance was last seen. */
  retentionDays: 90,
  /** The console and admin show instances seen in this window. */
  windowDays: 30,
  /** An instance counts toward the servers in use when it checked in within this many days (instances check in daily). */
  activeDays: 3,
  /** Event licenses: days before valid_from and after valid_to that still count as the event (time zones, the check-in the morning after). */
  eventGraceDays: 1,
  /** Event licenses, outside the dates: up to this many finished matches a day, with no tournament, is testing and is ignored. */
  testingMatchesPerDay: 2,
  /** Event licenses, outside the dates: a day with more matches than this, or a tournament with at least `fullEventTeams` teams, looks like a whole event. */
  fullEventMatchesPerDay: 20,
  fullEventTeams: 8,
  /** Largest request body accepted. */
  maxBodyBytes: 8 * 1024,
} as const;

export const DECLARED: readonly CheckinDeclared[] = ['none', 'testing', 'new_event', 'dates_moved'];

export type CheckinInput = {
  token: string;
  keyId: string;
  instanceId: string;
  serverCount: number;
  platformVersion: string;
  matchesPlayed: number;
  tournamentsLive: number;
  maxTournamentTeams: number;
  declared: CheckinDeclared;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/;
const MAX_TOKEN_LENGTH = 4096;
const MAX_COUNT = 100_000;

function count(value: unknown, fallback: number | null): number | null {
  if (value === undefined || value === null) return fallback;
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_COUNT ? (value as number) : null;
}

/** Checks the body's shape (not the signature). Unknown fields are ignored. */
export function parseCheckin(body: unknown): { ok: true; value: CheckinInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'expected an object' };
  const b = body as Record<string, unknown>;
  if (typeof b.token !== 'string' || b.token.length > MAX_TOKEN_LENGTH || !b.token.startsWith(`${TOKEN_PREFIX}.`)) return { ok: false, error: 'bad token' };
  if (typeof b.key_id !== 'string' || !LICENSE_ID.test(b.key_id)) return { ok: false, error: 'bad key_id' };
  const instanceId = typeof b.instance_id === 'string' ? b.instance_id.toLowerCase() : '';
  if (!UUID.test(instanceId)) return { ok: false, error: 'bad instance_id' };
  const serverCount = count(b.server_count, null);
  if (serverCount === null) return { ok: false, error: 'bad server_count' };
  if (typeof b.platform_version !== 'string' || !VERSION.test(b.platform_version)) return { ok: false, error: 'bad platform_version' };
  if (b.sent_at !== undefined && (typeof b.sent_at !== 'string' || b.sent_at.length > 40 || Number.isNaN(Date.parse(b.sent_at)))) {
    return { ok: false, error: 'bad sent_at' };
  }
  const matchesPlayed = count(b.matches_played, 0);
  const tournamentsLive = count(b.tournaments_live, 0);
  const maxTournamentTeams = count(b.max_tournament_teams, 0);
  if (matchesPlayed === null || tournamentsLive === null || maxTournamentTeams === null) return { ok: false, error: 'bad activity counts' };
  const declared = b.declared === undefined ? 'none' : b.declared;
  if (!DECLARED.includes(declared as CheckinDeclared)) return { ok: false, error: 'bad declared' };
  return {
    ok: true,
    value: {
      token: b.token,
      keyId: b.key_id,
      instanceId,
      serverCount,
      platformVersion: b.platform_version,
      matchesPlayed,
      tournamentsLive,
      maxTournamentTeams,
      declared: declared as CheckinDeclared,
    },
  };
}

/**
 * The token's payload when its Ed25519 signature checks out with one of
 * `publicKeys` (by the payload's kid), else null. Never throws.
 */
export function verifiedPayload(token: string, publicKeys: Record<string, PublicJwk>): LicensePayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as LicensePayload;
    if (typeof payload !== 'object' || payload === null || typeof payload.kid !== 'string' || typeof payload.id !== 'string') return null;
    const jwk = Object.hasOwn(publicKeys, payload.kid) ? publicKeys[payload.kid] : undefined;
    if (!jwk) return null;
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
    const ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii'), key, Buffer.from(parts[2], 'base64url'));
    return ok ? payload : null;
  } catch {
    return null;
  }
}

/** Constant-time string comparison. */
export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A short, stable label for an instance id in the console (the first 8 hex of its SHA-256). */
export function instanceLabel(instanceId: string): string {
  return createHash('sha256').update(instanceId, 'utf8').digest('hex').slice(0, 8);
}

// ---------------------------------------------------------------------------
// Usage

export type InstanceRow = {
  instanceId: string;
  firstSeen: Date;
  lastSeen: Date;
  serverCount: number;
  platformVersion: string;
  declared: CheckinDeclared;
};

export type DayRow = { day: string; matches: number; tournaments: number; maxTeams: number };

export type Usage = {
  /** Instances seen in the last windowDays, newest first. */
  instances: (InstanceRow & { label: string; active: boolean })[];
  /** Instances seen in the last activeDays, and their servers together. */
  activeInstances: number;
  activeServers: number;
  /** Servers of every instance seen in the last windowDays. */
  windowServers: number;
  maxServers: number;
  /** More servers in use (active instances) than the pack covers. */
  overServers: boolean;
  /** Event license: real event activity (more than testing) on a day outside the dates. */
  outsideDates: boolean;
  /** …and it looks like a whole event (many matches, or a big tournament). */
  fullEventOutside: boolean;
  /** The days outside the dates with real activity, oldest first. */
  outsideDays: DayRow[];
  /** The latest answer any instance gave ("none" when never answered). */
  declared: CheckinDeclared;
  /** Whether Auto Tournament gets an email about it (one per license per day at most, see checkinStore). */
  emailReason: 'servers' | 'event-dates' | null;
};

const DAY_MS = 24 * 60 * 60_000;

/** Pure: what the check-ins of one license add up to at `now`. */
export function usageFor(payload: Pick<LicensePayload, 'max_servers' | 'kind' | 'valid_from' | 'valid_to'>, rows: InstanceRow[], days: DayRow[], now: Date): Usage {
  const windowStart = now.getTime() - CHECKIN_RULES.windowDays * DAY_MS;
  const activeStart = now.getTime() - CHECKIN_RULES.activeDays * DAY_MS;
  const instances = rows
    .filter((r) => r.lastSeen.getTime() >= windowStart)
    .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
    .map((r) => ({ ...r, label: instanceLabel(r.instanceId), active: r.lastSeen.getTime() >= activeStart }));
  const active = instances.filter((i) => i.active);
  const activeServers = active.reduce((sum, i) => sum + i.serverCount, 0);
  const windowServers = instances.reduce((sum, i) => sum + i.serverCount, 0);
  const overServers = activeServers > payload.max_servers;

  // Days: summed over instances.
  const byDay = new Map<string, DayRow>();
  const firstDay = new Date(windowStart).toISOString().slice(0, 10);
  for (const d of days) {
    if (d.day < firstDay) continue;
    const cur = byDay.get(d.day) ?? { day: d.day, matches: 0, tournaments: 0, maxTeams: 0 };
    cur.matches += d.matches;
    cur.tournaments += d.tournaments;
    cur.maxTeams = Math.max(cur.maxTeams, d.maxTeams);
    byDay.set(d.day, cur);
  }
  let outsideDays: DayRow[] = [];
  if (payload.kind === 'event' && payload.valid_from && payload.valid_to) {
    const from = addDays(payload.valid_from, -CHECKIN_RULES.eventGraceDays);
    const to = addDays(payload.valid_to, CHECKIN_RULES.eventGraceDays);
    outsideDays = [...byDay.values()]
      .filter((d) => (d.day < from || d.day > to) && (d.tournaments > 0 || d.matches > CHECKIN_RULES.testingMatchesPerDay))
      .sort((a, b) => a.day.localeCompare(b.day));
  }
  const outsideDates = outsideDays.length > 0;
  const fullEventOutside = outsideDays.some((d) => d.matches > CHECKIN_RULES.fullEventMatchesPerDay || d.maxTeams >= CHECKIN_RULES.fullEventTeams);

  const answered = instances.find((i) => i.declared !== 'none');
  const declared = answered?.declared ?? 'none';

  // Event dates: testing is the default assumption. Only a whole event, and not "our dates moved", is worth a note to us.
  const emailReason = overServers ? 'servers' : fullEventOutside && declared !== 'dates_moved' ? 'event-dates' : null;

  return {
    instances,
    activeInstances: active.length,
    activeServers,
    windowServers,
    maxServers: payload.max_servers,
    overServers,
    outsideDates,
    fullEventOutside,
    outsideDays,
    declared,
    emailReason,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The note for the customer's own instance, or null. Calm and
 * informational: it never blocks anything and never accuses anyone.
 */
export function customerNotice(payload: Pick<LicensePayload, 'kind' | 'valid_from' | 'valid_to'>, usage: Usage, pricingUrl: string): string | null {
  const parts: string[] = [];
  if (usage.overServers) {
    parts.push(
      `This key is set up on ${plural(usage.activeInstances, 'instance', 'instances')} with ${plural(usage.activeServers, 'server', 'servers')} in total; its pack covers up to ${usage.maxServers}. For more servers, see ${pricingUrl}.`,
    );
  }
  if (usage.outsideDates && payload.valid_from && payload.valid_to) {
    const dates = payload.valid_from === payload.valid_to ? payload.valid_from : `${payload.valid_from} to ${payload.valid_to}`;
    parts.push(`Planning something new? This event license covers ${dates}. For another event you'll need a new event license: ${pricingUrl}. No action needed while you're testing.`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

/** The body of a 200 answer. */
export function checkinAnswer(payload: LicensePayload, usage: Usage, pricingUrl: string) {
  return {
    ok: true,
    usage: {
      instances: usage.activeInstances,
      servers: usage.activeServers,
      max_servers: usage.maxServers,
      window_days: CHECKIN_RULES.windowDays,
      overuse: usage.overServers,
      outside_dates: usage.outsideDates,
    },
    notice: customerNotice(payload, usage, pricingUrl),
  };
}

/** The UTC day of `now`, YYYY-MM-DD. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
