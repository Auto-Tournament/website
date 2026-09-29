/**
 * Day arithmetic on YYYY-MM-DD strings (UTC), shared by license issuing
 * (format.ts), the buyer-facing text (describe.ts) and the checkout form.
 * Pure: no node:crypto, so client components can import it.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import type { Period } from '../../components/pricing';

/** updates_until for founder packs: updates for as long as the product is sold. */
export const LIFETIME = '9999-12-31';
/** An event license covers up to 5 days in a row (Commercial License Terms, section 5). */
export const EVENT_MAX_DAYS = 5;

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

/** Same day `months` later; the 31st becomes the last day of a shorter month. */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return isoDay(target);
}

/** True for a real calendar day written YYYY-MM-DD. */
export function isIsoDay(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/**
 * The `eventdates` metadata value the checkout form sends for a start day:
 * event → "2026-10-03/2026-10-07" (the 5-day window), yearly and founder →
 * "2026-10-03".
 */
export function eventDatesValue(kind: Period, start: string): string {
  return kind === 'event' ? `${start}/${addDays(start, EVENT_MAX_DAYS - 1)}` : start;
}
