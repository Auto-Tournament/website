/**
 * What the console adds to the site nav: the account menu on the right and
 * the navbar's own sections. Pure data and helpers, no React, so the tests
 * can read them.
 */

import type { Role } from '../../lib/db/schema';
import { orgPathAllowed } from '../../lib/console/roles';

export type ConsoleLink = { label: string; href: string; note?: string };

/** A console path with the console's base in front ('' on its own host, '/console' in development). */
const at = (base: string, path: string) => (path === '/' ? base || '/' : `${base}${path}`);

/**
 * The account menu's links above Sign out: Admin, for admins only (the server
 * decides who is one). The logo is the way home.
 */
export function accountLinks({ base, isAdmin }: { base: string; isAdmin: boolean }): ConsoleLink[] {
  return isAdmin ? [{ label: 'Admin', href: at(base, '/admin') }] : [];
}

export type ConsoleArea = 'org' | 'admin';

/**
 * One entry in an area's navbar: a plain link, a small primary button
 * (customer area's "Buy"), or a menu of destinations with a one-line note
 * each (the admin area's Sales, Customers, Inbox and Security).
 */
export type ConsoleNavEntry =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'button'; label: string; href: string }
  | { kind: 'menu'; id: string; label: string; items: ConsoleLink[] };

/** Each area's navbar entries, in the order the bar shows them. Paths are console paths. */
export const navEntries: Record<ConsoleArea, ConsoleNavEntry[]> = {
  org: [
    { kind: 'link', label: 'Licenses', href: '/licenses' },
    { kind: 'link', label: 'Team', href: '/members' },
    { kind: 'link', label: 'Billing', href: '/billing' },
    { kind: 'button', label: 'Buy', href: '/buy' },
  ],
  admin: [
    { kind: 'link', label: 'Overview', href: '/admin' },
    {
      kind: 'menu',
      id: 'sales',
      label: 'Sales',
      items: [
        { label: 'Licenses', href: '/admin/licenses', note: 'Every issued license and its status.' },
        { label: 'New license', href: '/admin/licenses/new', note: 'Issue a license by hand.' },
      ],
    },
    {
      kind: 'menu',
      id: 'customers',
      label: 'Customers',
      items: [
        { label: 'Organizations', href: '/admin/orgs', note: 'Every organization with a license.' },
        { label: 'Users', href: '/admin/users', note: 'Everyone with a console account.' },
      ],
    },
    {
      kind: 'menu',
      id: 'inbox',
      label: 'Inbox',
      items: [
        { label: 'Leads', href: '/admin/leads', note: 'Contact-form and quote requests.' },
        { label: 'Free LANs', href: '/admin/free-lans', note: 'Free-LAN confirmations to review.' },
      ],
    },
    {
      kind: 'menu',
      id: 'security',
      label: 'Security',
      items: [
        { label: 'Passkeys', href: '/admin/passkeys', note: 'Admin passkeys registered for sign-in.' },
        { label: 'Audit log', href: '/admin/audit', note: 'Who did what, and when.' },
      ],
    },
  ],
};

/** Every entry's link(s), flattened in nav order: a menu contributes each of its items. */
function flatLinks(area: ConsoleArea): ConsoleLink[] {
  return navEntries[area].flatMap((e) => (e.kind === 'menu' ? e.items : [{ label: e.label, href: e.href }]));
}

/** The sections of each area, in the order the bar (or, flattened, the sub-nav) shows them. */
export const sections: Record<ConsoleArea, ConsoleLink[]> = {
  org: flatLinks('org'),
  admin: flatLinks('admin'),
};

/**
 * The customer area's entries for a role: a server provider sees Licenses
 * only; with no organization (null) there are none. Undefined: all of them.
 */
function entriesFor(area: ConsoleArea, role?: Role | null): ConsoleNavEntry[] {
  if (area !== 'org' || role === undefined) return navEntries[area];
  if (role === null) return [];
  return navEntries.org.filter((e) => e.kind === 'menu' || orgPathAllowed(role, e.href));
}

/**
 * An area's entries as they render on the current host: hrefs carry the
 * console base, and a menu's items keep their notes.
 */
export function navEntriesFor(area: ConsoleArea, base: string, role?: Role | null): ConsoleNavEntry[] {
  return entriesFor(area, role).map((e) =>
    e.kind === 'menu' ? { ...e, items: e.items.map((i) => ({ ...i, href: at(base, i.href) })) } : { ...e, href: at(base, e.href) },
  );
}

/**
 * An area's entries grouped for the phone sheet: consecutive plain links and
 * buttons share one unheaded group, each menu is its own heading section, in
 * nav order.
 */
export function navGroups(area: ConsoleArea, base: string, role?: Role | null): { heading?: string; items: ConsoleLink[] }[] {
  const groups: { heading?: string; items: ConsoleLink[] }[] = [];
  let plain: ConsoleLink[] = [];
  const flushPlain = () => {
    if (plain.length) groups.push({ items: plain });
    plain = [];
  };
  for (const e of navEntriesFor(area, base, role)) {
    if (e.kind === 'menu') {
      flushPlain();
      groups.push({ heading: e.label, items: e.items });
    } else {
      plain.push({ label: e.label, href: e.href });
    }
  }
  flushPlain();
  return groups;
}

/** An area's sections as links on the current host. */
export function sectionLinks(area: ConsoleArea, base: string): ConsoleLink[] {
  return sections[area].map((s) => ({ label: s.label, href: at(base, s.href) }));
}

/** Area roots only match themselves: /admin is Overview, /admin/leads is Leads. */
const roots = new Set(['/admin']);

/**
 * Which section a path is in: the longest section path it equals or sits
 * under (/admin/licenses/new is New license, /admin/licenses/abc is Licenses).
 * The path may carry the /console prefix (development, or the rewrite on the
 * console's host); both match. Null when none does.
 */
export function activeSection(area: ConsoleArea, pathname: string): string | null {
  const path = pathname.replace(/^\/console(?=\/|$)/, '') || '/';
  const hit = sections[area]
    .map((s) => s.href)
    .filter((p) => path === p || (!roots.has(p) && path.startsWith(`${p}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
}

/**
 * Which area a console page belongs to, for the single top nav bar: 'admin'
 * inside the admin CRM, 'org' inside an organization's pages, or null on
 * pages that are neither (sign-in, welcome, invite, passkey setup, refunds) —
 * those show the bar with just the back link, logo and account menu.
 */
export function navArea(pathname: string): ConsoleArea | null {
  if (activeSection('admin', pathname)) return 'admin';
  if (activeSection('org', pathname)) return 'org';
  return null;
}
