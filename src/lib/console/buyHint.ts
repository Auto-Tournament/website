import type { LicensePayload } from '../license/format';
import { licenseStatus, packName } from '../license/describe';
import type { Pack } from '../../components/pricing';

/**
 * The line above the console's Buy page when the organization already has a
 * license in use: "You have Servers S (event, ends 9 Oct). Need more
 * servers? Choose Servers M." Pure, so it is tested. Relative imports: vitest.
 */
const kindShort: Record<LicensePayload['kind'], string> = { event: 'event', year: 'yearly', founder: 'founder' };

function shortDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

export function buyHint(licenses: readonly LicensePayload[], packs: readonly Pack[], today: string): string | null {
  const inUse = licenses.filter((l) => {
    const s = licenseStatus(l, today);
    return s === 'active' || s === 'upcoming';
  });
  if (inUse.length === 0) return null;
  // The biggest one; the newest when two are the same size.
  const current = [...inUse].sort((a, b) => b.max_servers - a.max_servers || b.issued_at.localeCompare(a.issued_at))[0];
  const end = current.kind === 'event' ? (current.valid_to ?? current.updates_until) : current.kind === 'year' ? current.updates_until : null;
  const when = end ? `${kindShort[current.kind]}, ends ${shortDay(end)}` : kindShort[current.kind];
  // Sizes today (the license may carry an older limit): the next pack of the same product up from its size.
  const same = packs.find((p) => p.product === current.product && p.size === current.pack);
  const floor = Math.max(current.max_servers, same?.maxServers ?? 0);
  const bigger = packs.filter((p) => p.product === current.product && p.maxServers > floor).sort((a, b) => a.maxServers - b.maxServers)[0];
  const next = bigger ? `Need more servers? Choose ${bigger.name}.` : 'Need more servers? Ask us for a quote.';
  return `You have ${packName(current)} (${when}). ${next}`;
}
