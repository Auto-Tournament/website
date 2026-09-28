import 'server-only';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { db as sharedDb } from '../db/client';
import { licenses, vatAlerts } from '../db/schema';
import { packName } from '../license/describe';
import { emailConfig, sendEmail } from '../email/postmark';
import { seller } from '../../components/seller';
import { eurNokRate, type RateResult } from './rate';
import { vatAlertEmail, type SaleLine } from './email';

/**
 * The Norwegian VAT registration threshold check: sums paid license revenue
 * over the trailing 365 days, converts it to NOK, and emails the seller when
 * the rolling total crosses 70%, 90% or 100% of VAT_THRESHOLD_NOK for the
 * first time since it last dropped back below that line.
 *
 * Run after every issued live-mode paid license (src/lib/license/issue.ts)
 * and once a day (src/lib/db/startup.ts). Never throws: a failure here must
 * never break license issuing or app startup.
 *
 * Only live-mode sales count — test purchases are never real VAT-relevant
 * revenue. Refunds: there is no refunded/voided state on a license row yet,
 * so a refunded sale still counts here.
 * TODO(vat): once refunds are tracked on a license (or a linked sale), exclude
 * refunded/voided rows from the sum below.
 */

export const DEFAULT_VAT_THRESHOLD_NOK = 50_000;
export const WINDOW_DAYS = 365;
export const PERCENTS = [70, 90, 100] as const;
export type VatPercent = (typeof PERCENTS)[number];

export function vatThresholdNok(env: Record<string, string | undefined> = process.env): number {
  const raw = env.VAT_THRESHOLD_NOK?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_VAT_THRESHOLD_NOK;
}

export function vatAlertsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.VAT_ALERTS?.trim().toLowerCase() ?? '') !== 'off';
}

type SaleRow = { licenseId: string; pack: string; amountTotal: number; paidAt: Date };

async function salesInWindow(database: Db, windowStart: Date, now: Date): Promise<SaleRow[]> {
  const rows = await database
    .select({
      licenseId: licenses.licenseId,
      payload: licenses.payload,
      amountTotal: licenses.amountTotal,
      paidAt: licenses.paidAt,
      issuedAt: licenses.issuedAt,
    })
    .from(licenses)
    .where(
      and(
        eq(licenses.livemode, true),
        // paidAt is null on rows issued before that column existed; issuedAt is the next best thing.
        gte(sql`coalesce(${licenses.paidAt}, ${licenses.issuedAt})`, windowStart),
        lte(sql`coalesce(${licenses.paidAt}, ${licenses.issuedAt})`, now),
      ),
    )
    .orderBy(asc(sql`coalesce(${licenses.paidAt}, ${licenses.issuedAt})`));
  return rows.map((r) => ({
    licenseId: r.licenseId,
    pack: packName(r.payload),
    amountTotal: r.amountTotal ?? 0,
    paidAt: r.paidAt ?? r.issuedAt,
  }));
}

type AlertRow = { percent: number; active: boolean };

async function readAlert(database: Db, percent: number): Promise<AlertRow | null> {
  const [row] = await database.select({ percent: vatAlerts.percent, active: vatAlerts.active }).from(vatAlerts).where(eq(vatAlerts.percent, percent)).limit(1);
  return row ?? null;
}

async function writeAlert(database: Db, percent: number, patch: { active: boolean; firstCrossedAt?: Date; lastTotalNok: number }, now: Date): Promise<void> {
  await database
    .insert(vatAlerts)
    .values({ percent, active: patch.active, firstCrossedAt: patch.firstCrossedAt ?? null, lastTotalNok: patch.lastTotalNok, updatedAt: now })
    .onConflictDoUpdate({
      target: vatAlerts.percent,
      set: {
        active: patch.active,
        // Keep the first-crossed timestamp already on the row unless this write is the one setting it.
        firstCrossedAt: patch.firstCrossedAt ?? sql`${vatAlerts.firstCrossedAt}`,
        lastTotalNok: patch.lastTotalNok,
        updatedAt: now,
      },
    });
}

async function sendAlert(input: {
  percent: VatPercent;
  thresholdNok: number;
  totalNok: number;
  totalEurCents: number;
  rate: RateResult;
  sales: SaleRow[];
}): Promise<void> {
  const config = emailConfig();
  if (!config) {
    // No amounts, no email address: just enough to know an alert would have fired.
    console.info('[vat] threshold crossed (Postmark not configured, no email sent)', { percent: input.percent });
    return;
  }
  const saleLines: SaleLine[] = input.sales.map((s) => ({
    date: s.paidAt.toISOString().slice(0, 10),
    licenseId: s.licenseId,
    pack: s.pack,
    amount: `€${(s.amountTotal / 100).toFixed(2)}`,
  }));
  const mail = vatAlertEmail({
    percent: input.percent,
    thresholdNok: input.thresholdNok,
    totalNok: input.totalNok,
    totalEur: input.totalEurCents / 100,
    rate: input.rate.rate,
    rateIsFallback: input.rate.fallback,
    sales: saleLines,
  });
  const result = await sendEmail({ to: seller.email, ...mail, tag: 'vat-threshold' }, config);
  if (result.ok) console.info('[vat] alert emailed', { percent: input.percent });
  else console.error('[vat] alert email failed', { percent: input.percent, error: result.error });
}

export type VatCheckResult = { totalNok: number; totalEurCents: number; rate: RateResult } | null;

/**
 * Computes the rolling total and fires any newly-crossed threshold's alert.
 * Returns null when VAT_ALERTS=off. Never throws (a failure is logged and
 * swallowed) — callers still don't need to catch, but do anyway to be safe.
 */
export async function checkVatThreshold(options: { db?: Db; fetchImpl?: typeof fetch; now?: Date } = {}): Promise<VatCheckResult> {
  if (!vatAlertsEnabled()) return null;
  try {
    const database = options.db ?? sharedDb();
    const now = options.now ?? new Date();
    const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60_000);
    const sales = await salesInWindow(database, windowStart, now);
    const totalEurCents = sales.reduce((sum, s) => sum + s.amountTotal, 0);
    const rate = await eurNokRate({ fetchImpl: options.fetchImpl, now: now.getTime() });
    const totalNok = (totalEurCents / 100) * rate.rate;
    const thresholdNok = vatThresholdNok();

    for (const percent of PERCENTS) {
      const line = (thresholdNok * percent) / 100;
      const crossed = totalNok >= line;
      const existing = await readAlert(database, percent);
      const wasActive = existing?.active ?? false;
      if (crossed && !wasActive) {
        await writeAlert(database, percent, { active: true, firstCrossedAt: now, lastTotalNok: Math.round(totalNok) }, now);
        await sendAlert({ percent, thresholdNok, totalNok, totalEurCents, rate, sales });
      } else if (!crossed && wasActive) {
        await writeAlert(database, percent, { active: false, lastTotalNok: Math.round(totalNok) }, now);
      } else {
        await writeAlert(database, percent, { active: wasActive, lastTotalNok: Math.round(totalNok) }, now);
      }
    }
    return { totalNok, totalEurCents, rate };
  } catch (err) {
    console.error('[vat] threshold check failed', err instanceof Error ? err.message : err);
    return null;
  }
}
