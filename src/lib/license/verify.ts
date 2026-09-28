/**
 * The public license check (/verify/<id>): only what a third party needs to
 * see a license is real. Never the key, email, customer id or order reference.
 * Pure.
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { formatDay, kindNames, licenseDurationText, licenseStatus, packName, productContents, statusHint } from './describe';
import { LIFETIME, type LicensePayload } from './format';

/** License ids look like L-3kq8Zx0bQ1aR. */
export const LICENSE_ID = /^L-[A-Za-z0-9_-]{6,40}$/;

export type PublicStatus = 'valid' | 'upcoming' | 'expired' | 'test' | 'replaced' | 'revoked' | 'not-found';

export type PublicCheck =
  | { status: 'not-found' }
  | {
      status: Exclude<PublicStatus, 'not-found'>;
      statusText: string;
      rows: [string, string][];
      /** The license that replaced this one (a reissue), for a link. */
      replacedBy?: string;
    };

export function publicCheck(
  record: { payload: LicensePayload; livemode: boolean; superseded_by?: string | null; revoked_at?: string | null } | null,
  today: string,
): PublicCheck {
  if (!record) return { status: 'not-found' };
  const p = record.payload;
  const s = licenseStatus(p, today);
  let status: Exclude<PublicStatus, 'not-found'>;
  let statusText: string;
  // Refunded and revoked read the same in public: the reason is between us and the buyer.
  if (record.revoked_at) {
    status = 'revoked';
    statusText = 'Revoked: this license is no longer valid';
  } else if (record.superseded_by && LICENSE_ID.test(record.superseded_by)) {
    status = 'replaced';
    statusText = `Replaced by ${record.superseded_by}`;
  } else if (!record.livemode) {
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
  if (status !== 'revoked' && status !== 'replaced' && record.livemode && p.kind !== 'founder') {
    const hint = statusHint(p, new Date(`${today}T00:00:00Z`));
    if (hint) statusText += ` (${hint})`;
  }
  const rows: [string, string][] = [
    ['Licensee', p.licensee ?? 'Not given'],
    ['License', `${packName(p)}: ${productContents(p.product)}, up to ${p.max_servers} servers`],
    ['Kind', kindNames[p.kind]],
    ['License duration', licenseDurationText(p)],
    ['Updates until', p.updates_until === LIFETIME ? 'For life' : formatDay(p.updates_until)],
    ['License id', p.id],
  ];
  return status === 'replaced' ? { status, statusText, rows, replacedBy: record.superseded_by as string } : { status, statusText, rows };
}
