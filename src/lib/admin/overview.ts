/**
 * The admin overview's numbers. Read-only; the caller checks the user is an
 * admin. Revenue comes from src/lib/license/sales.ts (the same sales the VAT
 * threshold check counts).
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { licenses, organizations } from '../db/schema';
import { founderLastDay, founderLimit } from '../../components/pricing';
import { addDays } from '../license/format';
import { createLicenseStore, fromRow, type LicenseRecord } from '../license/store';
import { salesBetween, totals, type Sale, type Totals } from '../license/sales';
import { endsOn } from './licenses';

const DAY_MS = 24 * 60 * 60_000;

export type Revenue = { last30: Totals; last12m: Totals; vatNok: number };

/** Sales in the last 30 days and the last 12 months (365 days, the VAT window). */
export async function revenue(db: Db, eurNok: number, now = new Date()): Promise<Revenue & { recent: Sale[] }> {
  const year = await salesBetween(db, new Date(now.getTime() - 365 * DAY_MS), now, { newest: true });
  const monthStart = new Date(now.getTime() - 30 * DAY_MS);
  const last12m = totals(year, eurNok);
  return { last30: totals(year.filter((s) => s.paidAt >= monthStart), eurNok), last12m, vatNok: last12m.nok, recent: year.slice(0, 10) };
}

export type FounderStatus = { taken: number; limit: number; lastDay: string; daysLeft: number };

export async function founderStatus(db: Db, now = new Date()): Promise<FounderStatus> {
  const taken = await createLicenseStore(db).founderCount();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysLeft = Math.max(0, Math.round((Date.parse(`${founderLastDay}T00:00:00Z`) - today) / DAY_MS));
  return { taken, limit: founderLimit, lastDay: founderLastDay, daysLeft };
}

export type Ending = { record: LicenseRecord; endsOn: string; orgName: string | null };

/** Current live licenses whose event or yearly updates end within `days` days (today included). */
export async function endingSoon(db: Db, today: string, days = 30): Promise<Ending[]> {
  const until = addDays(today, days);
  const rows = await db
    .select({ license: licenses, orgName: organizations.name })
    .from(licenses)
    .leftJoin(organizations, eq(organizations.id, licenses.orgId))
    .where(
      and(
        eq(licenses.livemode, true),
        isNull(licenses.supersededBy),
        isNull(licenses.revokedAt),
        sql`${licenses.kind} in ('event', 'year')`,
        sql`coalesce(${licenses.payload}->>'valid_to', ${licenses.payload}->>'updates_until') between ${today} and ${until}`,
      ),
    )
    .orderBy(desc(licenses.issuedAt))
    .limit(200);
  return rows
    .map(({ license, orgName }) => {
      const record = fromRow(license);
      return { record, endsOn: endsOn(record.payload) ?? '', orgName };
    })
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn));
}
