/**
 * What the console adds to the site nav: the account menu on the right and
 * the sub-navigation row under the nav. Pure data and helpers, no React, so
 * the tests can read them.
 */

export type ConsoleLink = { label: string; href: string };

/** A console path with the console's base in front ('' on its own host, '/console' in development). */
const at = (base: string, path: string) => (path === '/' ? base || '/' : `${base}${path}`);

/** The account menu's links, top to bottom. Admin only for admins (the server decides who is one). */
export function accountLinks({ base, isAdmin }: { base: string; isAdmin: boolean }): ConsoleLink[] {
  return [
    { label: 'Console home', href: at(base, '/licenses') },
    ...(isAdmin ? [{ label: 'Admin', href: at(base, '/admin') }] : []),
    { label: 'Add an organization', href: at(base, '/welcome') },
  ];
}

export type ConsoleArea = 'org' | 'admin';

/** The sections of each area, in the order the sub-nav shows them. Paths are console paths. */
export const sections: Record<ConsoleArea, ConsoleLink[]> = {
  org: [
    { label: 'Licenses', href: '/licenses' },
    { label: 'Members', href: '/members' },
    { label: 'Billing', href: '/billing' },
    { label: 'Buy', href: '/buy' },
  ],
  admin: [
    { label: 'Overview', href: '/admin' },
    { label: 'Licenses', href: '/admin/licenses' },
    { label: 'New license', href: '/admin/licenses/new' },
    { label: 'Organizations', href: '/admin/orgs' },
    { label: 'Users', href: '/admin/users' },
    { label: 'Leads', href: '/admin/leads' },
    { label: 'Free LANs', href: '/admin/free-lans' },
    { label: 'Audit log', href: '/admin/audit' },
    { label: 'Passkeys', href: '/admin/passkeys' },
  ],
};

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
