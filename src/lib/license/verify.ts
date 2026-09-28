/**
 * The public license check (/verify/<id>): only what a third party needs to
 * see a license is real. Never the key, email, customer id or order reference.
 * Pure.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { formatDay, kindNames, licenseStatus, packName, periodText, productContents } from './describe';
import { LIFETIME, type LicensePayload } from './format';

/** License ids look like L-3kq8Zx0bQ1aR. */
export const LICENSE_ID = /^L-[A-Za-z0-9_-]{6,40}$/;

export type PublicStatus = 'valid' | 'upcoming' | 'expired' | 'test' | 'not-found';

export type PublicCheck =
  | { status: 'not-found' }
  | {
      status: Exclude<PublicStatus, 'not-found'>;
      statusText: string;
      rows: [string, string][];
    };

export function publicCheck(record: { payload: LicensePayload; livemode: boolean } | null, today: string): PublicCheck {
  if (!record) return { status: 'not-found' };
  const p = record.payload;
  const s = licenseStatus(p, today);
  let status: Exclude<PublicStatus, 'not-found'>;
  let statusText: string;
  if (!record.livemode) {
    status = 'test';
    statusText = 'Test license: made in test mode, not valid for use';
  } else if (s === 'upcoming') {
    status = 'upcoming';
    statusText = `Upcoming: valid from ${formatDay(p.valid_from ?? p.updates_until)}`;
  } else if (s === 'expired') {
    status = 'expired';
    statusText = `Expired: the event ended ${formatDay(p.valid_to ?? p.updates_until)}`;
  } else if (s === 'updates-ended') {
    status = 'valid';
    statusText = `Valid for the versions it covers; updates ended ${formatDay(p.updates_until)}`;
  } else {
    status = 'valid';
    statusText = 'Valid';
  }
  const rows: [string, string][] = [
    ['Licensee', p.licensee ?? 'Not given'],
    ['License', `${packName(p)}: ${productContents(p.product)}, up to ${p.max_servers} servers`],
    ['Kind', kindNames[p.kind]],
    ['Period', periodText(p)],
    ['Updates until', p.updates_until === LIFETIME ? 'For life' : formatDay(p.updates_until)],
    ['License id', p.id],
  ];
  return { status, statusText, rows };
}
