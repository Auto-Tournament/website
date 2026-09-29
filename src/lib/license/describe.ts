/**
 * Plain-English descriptions of a license, shared by the license email and
 * the pages. Pure, no Next import.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import type { Period } from '../../components/pricing';
import { addDays, addMonths, EVENT_MAX_DAYS, LIFETIME } from './dates';
import type { LicensePayload } from './format';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

function toUtcMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to`, inclusive of both ends (same day is 1). */
function dayCount(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000) + 1;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 2026-10-16 → "16 October 2026" (English, UTC, no weekday). Anything else is returned as is. */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/**
 * A date range for buyers: "16 October 2026" for a single day, "16–18
 * October 2026" within a month, "30 October – 2 November 2026" across
 * months, "30 December 2026 – 2 January 2027" across years.
 */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  const fm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const tm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!fm || !tm) return `${formatDay(from)} – ${formatDay(to)}`;
  const [, fy, fmo, fd] = fm;
  const [, ty, tmo, td] = tm;
  if (fy !== ty) return `${formatDay(from)} – ${formatDay(to)}`;
  if (fmo === tmo) return `${Number(fd)}–${Number(td)} ${monthName(Number(fmo))} ${fy}`;
  return `${Number(fd)} ${monthName(Number(fmo))} – ${Number(td)} ${monthName(Number(tmo))} ${fy}`;
}

export const kindNames: Record<LicensePayload['kind'], string> = {
  event: 'One event',
  year: 'Yearly',
  founder: 'Founding supporter',
};

/** "Platform L" */
export function packName(license: Pick<LicensePayload, 'product' | 'pack'>): string {
  return `${license.product === 'platform' ? 'Platform' : 'Servers'} ${license.pack}`;
}

/** What the pack's product includes. */
export function productContents(product: LicensePayload['product']): string {
  return product === 'platform'
    ? 'the Auto Tournament platform, CS2 Server Manager and Ready Up, plus the game packs used with it'
    : 'CS2 Server Manager and Ready Up';
}

/**
 * The "License duration" line, for the buyer:
 * - event: "One event: 16 October 2026 (1 day)" / "One event: 16–18 October 2026 (3 days)"
 * - yearly: "12 months: 28 September 2026 – 27 September 2027"
 * - founder: "Lifetime (founding supporter)"
 */
export function licenseDurationText(license: Pick<LicensePayload, 'kind' | 'issued_at' | 'updates_until' | 'valid_from' | 'valid_to'>): string {
  if (license.kind === 'founder') return 'Lifetime (founding supporter)';
  if (license.kind === 'event') {
    const from = license.valid_from ?? license.issued_at.slice(0, 10);
    const to = license.valid_to ?? license.updates_until;
    return `One event: ${formatRange(from, to)} (${plural(dayCount(from, to), 'day')})`;
  }
  // 12 months ending the day before updates_until: the start day chosen at checkout.
  const start = addMonths(license.updates_until, -12);
  const end = addDays(license.updates_until, -1);
  return `12 months: ${formatRange(start, end)}`;
}

/**
 * The "Updates" line, for the buyer:
 * "Includes every version released up to 16 October 2026, and later
 * bugfixes for those versions" / "Includes all future versions (lifetime
 * updates)".
 */
export function updatesText(license: Pick<LicensePayload, 'updates_until'> & Partial<Pick<LicensePayload, 'kind'>>): string {
  if (license.updates_until === LIFETIME) return 'Includes all future versions (lifetime updates)';
  // An event license is only for its dates, so it covers what exists by then and nothing released later.
  if (license.kind === 'event') return `Includes every version released up to ${formatDay(license.updates_until)}`;
  return `Includes every version released up to ${formatDay(license.updates_until)}, and later bugfixes for those versions`;
}

/** What the license lets the buyer do, in a sentence or three (Commercial License Terms, sections 5 to 8). */
export function coverageText(license: Pick<LicensePayload, 'kind' | 'updates_until'>): string {
  if (license.kind === 'event') {
    return (
      'Commercial use for the event named in your order, on the dates above. ' +
      'You get the releases that come out until the event ends. After the event, a new event needs a new license.'
    );
  }
  if (license.kind === 'founder') {
    return (
      'Commercial use for your own events and events you run for clients, with every version we release, for life. ' +
      'There is no yearly fee.'
    );
  }
  return (
    `Commercial use for your own events and events you run for clients, with every version line (such as 1.4) that comes out by ${formatDay(license.updates_until)}. ` +
    'Those lines stay yours after that, including their later patch releases. Renew yearly to get newer lines.'
  );
}

/**
 * Where a license stands on `today` (YYYY-MM-DD, UTC):
 * - event: upcoming before the window, active during it, expired after.
 * - year: active until updates_until; after that `updates-ended`: the
 *   covered version lines stay licensed (Commercial License Terms, section 8).
 * - founder: always active, updates for life.
 */
export type LicenseStatus = 'active' | 'upcoming' | 'expired' | 'updates-ended';

export function licenseStatus(license: Pick<LicensePayload, 'kind' | 'updates_until' | 'valid_from' | 'valid_to'>, today: string): LicenseStatus {
  if (license.kind === 'founder') return 'active';
  if (license.kind === 'event') {
    const from = license.valid_from ?? license.updates_until;
    const to = license.valid_to ?? license.updates_until;
    if (today < from) return 'upcoming';
    return today > to ? 'expired' : 'active';
  }
  return today > license.updates_until ? 'updates-ended' : 'active';
}

/** One line for the status, for the buyer. */
export function statusText(license: Pick<LicensePayload, 'kind' | 'updates_until' | 'valid_from' | 'valid_to'>, today: string): string {
  const status = licenseStatus(license, today);
  if (license.kind === 'founder') return 'Active, updates for life';
  if (license.kind === 'event') {
    if (status === 'upcoming') return `Upcoming, starts ${formatDay(license.valid_from ?? license.updates_until)}`;
    if (status === 'expired') return `Expired, the event ended ${formatDay(license.valid_to ?? license.updates_until)}`;
    return `Active until ${formatDay(license.valid_to ?? license.updates_until)}`;
  }
  if (status === 'updates-ended') return `Updates ended ${formatDay(license.updates_until)}. The versions it covers stay licensed.`;
  return `Active, updates until ${formatDay(license.updates_until)}`;
}

/**
 * A short relative hint to put next to the status: "starts in 18 days",
 * "ends in 5 days", "ends today", "ended 3 days ago". Founder licenses have
 * no hint (there is nothing to count down). Computed against `now` so it is
 * testable.
 */
export function statusHint(license: Pick<LicensePayload, 'kind' | 'issued_at' | 'updates_until' | 'valid_from' | 'valid_to'>, now: Date = new Date()): string {
  if (license.kind === 'founder') return '';
  const today = todayUtc(now);
  const start = license.kind === 'event' ? (license.valid_from ?? license.updates_until) : license.issued_at.slice(0, 10);
  const end = license.kind === 'event' ? (license.valid_to ?? license.updates_until) : license.updates_until;
  if (today < start) return `starts in ${plural(dayCount(today, start) - 1, 'day')}`;
  if (today <= end) {
    const left = dayCount(today, end) - 1;
    return left === 0 ? 'ends today' : `ends in ${plural(left, 'day')}`;
  }
  return `ended ${plural(dayCount(end, today) - 1, 'day')} ago`;
}

/** UTC today, YYYY-MM-DD. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The live line under the checkout's start-date picker, for a start day
 * (YYYY-MM-DD):
 * - event: "Valid 3–7 October 2026 (5 days)"
 * - yearly: "Valid 3 October 2026 – 2 October 2027"
 * - founder: "Starts 3 October 2026. Updates for life."
 */
export function checkoutValidityText(kind: Period, start: string): string {
  if (kind === 'founder') return `Starts ${formatDay(start)}. Updates for life.`;
  if (kind === 'event') return `Valid ${formatRange(start, addDays(start, EVENT_MAX_DAYS - 1))} (${plural(EVENT_MAX_DAYS, 'day')})`;
  return `Valid ${formatRange(start, addDays(addMonths(start, 12), -1))}`;
}
