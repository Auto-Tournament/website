/**
 * License check-ins in Postgres (license_checkins, license_checkin_days,
 * license_usage_alerts): recording one, reading a license's usage, and the
 * once-a-day internal email when a license is used beyond its terms. The
 * rules are in ./checkin.ts. Nothing here blocks anything.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { and, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { licenseCheckinDays, licenseCheckins, licenseUsageAlerts } from '../db/schema';
import { escapeHtml } from './email';
import { packName } from './describe';
import { CHECKIN_RULES, usageFor, utcDay, type CheckinInput, type DayRow, type InstanceRow, type Usage } from './checkin';
import type { LicensePayload } from './format';

const DAY_MS = 24 * 60 * 60_000;

/** Stores one check-in: the instance row (first/last seen, servers, version, answer) and today's activity counts. */
export async function recordCheckin(db: Db, input: CheckinInput, now = new Date()): Promise<void> {
  await db
    .insert(licenseCheckins)
    .values({
      licenseId: input.keyId,
      instanceId: input.instanceId,
      firstSeen: now,
      lastSeen: now,
      serverCount: input.serverCount,
      platformVersion: input.platformVersion,
      declared: input.declared,
    })
    .onConflictDoUpdate({
      target: [licenseCheckins.licenseId, licenseCheckins.instanceId],
      set: { lastSeen: now, serverCount: input.serverCount, platformVersion: input.platformVersion, declared: input.declared },
    });
  if (input.matchesPlayed > 0 || input.tournamentsLive > 0 || input.maxTournamentTeams > 0) {
    await db
      .insert(licenseCheckinDays)
      .values({
        licenseId: input.keyId,
        instanceId: input.instanceId,
        day: utcDay(now),
        matches: input.matchesPlayed,
        tournaments: input.tournamentsLive,
        maxTeams: input.maxTournamentTeams,
      })
      .onConflictDoUpdate({
        target: [licenseCheckinDays.licenseId, licenseCheckinDays.instanceId, licenseCheckinDays.day],
        set: {
          matches: sql`${licenseCheckinDays.matches} + ${input.matchesPlayed}`,
          tournaments: sql`${licenseCheckinDays.tournaments} + ${input.tournamentsLive}`,
          maxTeams: sql`greatest(${licenseCheckinDays.maxTeams}, ${input.maxTournamentTeams})`,
        },
      });
  }
}

/** The raw rows for some licenses, within the usage window. */
async function rowsFor(db: Db, licenseIds: string[], now: Date): Promise<{ instances: Map<string, InstanceRow[]>; days: Map<string, DayRow[]> }> {
  const instances = new Map<string, InstanceRow[]>();
  const days = new Map<string, DayRow[]>();
  if (licenseIds.length === 0) return { instances, days };
  const since = new Date(now.getTime() - CHECKIN_RULES.windowDays * DAY_MS);
  const [iRows, dRows] = await Promise.all([
    db
      .select()
      .from(licenseCheckins)
      .where(and(inArray(licenseCheckins.licenseId, licenseIds), gte(licenseCheckins.lastSeen, since))),
    db
      .select()
      .from(licenseCheckinDays)
      .where(and(inArray(licenseCheckinDays.licenseId, licenseIds), gte(licenseCheckinDays.day, utcDay(since)))),
  ]);
  for (const r of iRows) {
    const list = instances.get(r.licenseId) ?? [];
    list.push({ instanceId: r.instanceId, firstSeen: r.firstSeen, lastSeen: r.lastSeen, serverCount: r.serverCount, platformVersion: r.platformVersion, declared: r.declared });
    instances.set(r.licenseId, list);
  }
  for (const r of dRows) {
    const list = days.get(r.licenseId) ?? [];
    list.push({ day: r.day, matches: r.matches, tournaments: r.tournaments, maxTeams: r.maxTeams });
    days.set(r.licenseId, list);
  }
  return { instances, days };
}

/** Usage per license id, for the given payloads. Licenses that never checked in get an empty usage. */
export async function usageForLicenses(db: Db, payloads: LicensePayload[], now = new Date()): Promise<Map<string, Usage>> {
  const ids = [...new Set(payloads.map((p) => p.id))];
  const { instances, days } = await rowsFor(db, ids, now);
  const out = new Map<string, Usage>();
  for (const p of payloads) out.set(p.id, usageFor(p, instances.get(p.id) ?? [], days.get(p.id) ?? [], now));
  return out;
}

export async function usageForLicense(db: Db, payload: LicensePayload, now = new Date()): Promise<Usage> {
  return (await usageForLicenses(db, [payload], now)).get(payload.id) as Usage;
}

/**
 * Claims today's internal email for this license: true once per license per
 * UTC day (the first caller wins), false after that.
 */
export async function claimUsageEmail(db: Db, licenseId: string, reason: string, now = new Date()): Promise<boolean> {
  const today = utcDay(now);
  const rows = await db
    .insert(licenseUsageAlerts)
    .values({ licenseId, lastEmailedDay: today, reason, updatedAt: now })
    .onConflictDoUpdate({
      target: licenseUsageAlerts.licenseId,
      set: { lastEmailedDay: today, reason, updatedAt: now },
      setWhere: ne(licenseUsageAlerts.lastEmailedDay, today),
    })
    .returning({ id: licenseUsageAlerts.licenseId });
  return rows.length > 0;
}

/** Deletes check-ins, activity days and email marks older than the retention (src/lib/db/prune.ts). */
export async function pruneCheckins(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CHECKIN_RULES.retentionDays * DAY_MS);
  const [a, b, c] = await Promise.all([
    db.delete(licenseCheckins).where(lt(licenseCheckins.lastSeen, cutoff)).returning({ x: licenseCheckins.licenseId }),
    db.delete(licenseCheckinDays).where(lt(licenseCheckinDays.day, utcDay(cutoff))).returning({ x: licenseCheckinDays.licenseId }),
    db.delete(licenseUsageAlerts).where(lt(licenseUsageAlerts.updatedAt, cutoff)).returning({ x: licenseUsageAlerts.licenseId }),
  ]);
  return a.length + b.length + c.length;
}

// ---------------------------------------------------------------------------
// The internal email (to seller.email): a note to follow up, never sent to the customer.

const declaredText: Record<Usage['declared'], string> = {
  none: 'no answer',
  testing: 'testing or setting up',
  new_event: 'a new event',
  dates_moved: 'the event dates moved',
};

export function usageEmail(payload: LicensePayload, usage: Usage, adminUrl: string): { subject: string; text: string; html: string } {
  const who = payload.licensee ?? 'no licensee';
  const reason =
    usage.emailReason === 'servers'
      ? `${usage.activeServers} servers on ${usage.activeInstances} active instances, above the pack's ${usage.maxServers}`
      : 'an event-sized use outside the event dates';
  const subject = `License ${payload.id} (${who}): ${reason}`;
  const lines = [
    `License ${payload.id}, ${packName(payload)} (up to ${payload.max_servers} servers), ${payload.kind}${payload.valid_from ? `, ${payload.valid_from} to ${payload.valid_to}` : ''}.`,
    `Licensee: ${who}.`,
    '',
    `Why: ${reason}.`,
    `Instances seen in the last ${CHECKIN_RULES.windowDays} days: ${usage.instances.length}; active (last ${CHECKIN_RULES.activeDays} days): ${usage.activeInstances} with ${usage.activeServers} servers.`,
    ...(payload.kind === 'event' ? [`Their answer to "what's this?": ${declaredText[usage.declared]}.`] : []),
    '',
    'INSTANCES',
    ...usage.instances.map((i) => `- ${i.label}  last seen ${i.lastSeen.toISOString().slice(0, 16).replace('T', ' ')} UTC  ${i.serverCount} servers  v${i.platformVersion}`),
    ...(usage.outsideDays.length > 0
      ? ['', 'ACTIVITY OUTSIDE THE DATES', ...usage.outsideDays.map((d) => `- ${d.day}  ${d.matches} matches  ${d.tournaments} tournaments  largest ${d.maxTeams} teams`)]
      : []),
    '',
    `Details: ${adminUrl}`,
    'Nothing was blocked or sent to the customer. At most one of these a day per license.',
    '',
  ];
  const text = lines.join('\n');
  const html = `<pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${escapeHtml(text)}</pre>`;
  return { subject, text, html };
}
