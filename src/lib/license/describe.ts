/**
 * Plain-English descriptions of a license, shared by the license email and
 * the pages. Pure, no Next import.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { LIFETIME, type LicensePayload } from './format';

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

/** 2026-10-03 → "3 October 2026". Anything else is returned as is. */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const month = MONTH_NAMES[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : day;
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

/** "One event, 3 October 2026 to 5 October 2026" / "Yearly, 28 September 2026 to 28 September 2027" / "Founding supporter, lifetime updates" */
export function periodText(license: Pick<LicensePayload, 'kind' | 'issued_at' | 'updates_until' | 'valid_from' | 'valid_to'>): string {
  if (license.kind === 'founder') return 'Founding supporter, lifetime updates';
  if (license.kind === 'event') {
    const from = license.valid_from ?? license.issued_at.slice(0, 10);
    const to = license.valid_to ?? license.updates_until;
    return `One event, ${formatDay(from)} to ${formatDay(to)}`;
  }
  return `Yearly, ${formatDay(license.issued_at.slice(0, 10))} to ${formatDay(license.updates_until)}`;
}

/** "Release lines up to 28 September 2027" / "For life" */
export function updatesText(license: Pick<LicensePayload, 'updates_until'>): string {
  return license.updates_until === LIFETIME ? 'For life' : `Release lines that came out by ${formatDay(license.updates_until)}`;
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

/** UTC today, YYYY-MM-DD. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
