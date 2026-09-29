import { links } from '../links';

/**
 * What the site nav shows. The bar keeps the few things people come for
 * (Pricing, the console, Install); everything else sits in three menus, Product,
 * Games and Resources. Every destination appears exactly once across the bar and
 * the menus: the CS2 status dot in the bar is the only link to
 * /compatibility, licenses and keys live in the console (the bar's Console
 * button), and the Install button is the only link to the install guide.
 * Pure data and helpers, no React, so the tests can read them.
 */

export type NavIcon = 'platform' | 'games' | 'cs2' | 'readyUp' | 'csm' | 'pricing' | 'docs' | 'github' | 'discord' | 'console' | 'verify' | 'contact';

export type NavLink = {
  label: string;
  href: string;
  /** One line under the label. */
  note: string;
  icon: NavIcon;
  /** Shows the live CS2 compatibility dot next to the label. */
  status?: true;
};

export type NavGroup = { heading: string; items: NavLink[] };

export type NavMenu = {
  id: 'product' | 'games' | 'resources';
  label: string;
  /** Where the trigger points before the page's script runs. */
  fallbackHref: string;
  groups: NavGroup[];
};

export const menus: NavMenu[] = [
  {
    id: 'product',
    label: 'Product',
    fallbackHref: '/platform',
    groups: [
      {
        heading: 'Product',
        items: [{ label: 'Platform', href: '/platform', note: 'Brackets, veto, match flow, failover, webhooks.', icon: 'platform' }],
      },
      {
        heading: 'Licenses',
        items: [
          { label: 'Pricing', href: links.pricing, note: 'Free if nobody earns money. Otherwise one price.', icon: 'pricing' },
          { label: 'Console', href: links.account, note: 'Your licenses, keys, team and invoices.', icon: 'console' },
          { label: 'Check a license', href: links.verify, note: 'See whether a license id is valid.', icon: 'verify' },
        ],
      },
    ],
  },
  {
    id: 'games',
    label: 'Games',
    fallbackHref: '/games',
    groups: [
      {
        heading: 'Games',
        items: [
          { label: 'All games', href: '/games', note: 'CS2 module included. More games as modules.', icon: 'games' },
          { label: 'Counter-Strike 2', href: '/games/cs2', note: 'Plugins, tools and commercial use for CS2.', icon: 'cs2' },
        ],
      },
      {
        heading: 'CS2 tools',
        items: [
          { label: 'Ready Up', href: '/games/cs2/ready-up', note: 'The native CS2 match plugin. No Metamod.', icon: 'readyUp' },
          { label: 'CS2 Server Manager', href: '/games/cs2/csm', note: 'Many CS2 servers on one Linux machine.', icon: 'csm' },
        ],
      },
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    fallbackHref: '#site-links',
    groups: [
      {
        heading: 'Resources',
        items: [
          { label: 'Docs', href: links.docs, note: 'Setup, configuration and the API.', icon: 'docs' },
          { label: 'GitHub', href: links.github, note: 'Source code, issues and releases.', icon: 'github' },
          { label: 'Discord', href: links.discord, note: 'Ask the people who build it.', icon: 'discord' },
          { label: 'Contact', href: links.contact, note: 'Quotes, invoices and free LAN confirmations.', icon: 'contact' },
        ],
      },
    ],
  },
];

/** The one plain link outside the menus: the Install button on the right. */
export const barLinks = {
  install: { label: 'Install', href: links.install },
} as const;

/**
 * Links that leave the site open in a new tab and carry an arrow. `site` is the
 * main site's origin when the nav renders on the console's own host: links to
 * it are absolute there but still the same site, so they stay in the tab.
 */
export function isExternal(href: string, site = ''): boolean {
  if (site && (href === site || href.startsWith(`${site}/`))) return false;
  return /^https?:\/\//.test(href);
}

/**
 * A site link as it must be written on the current host. On the main site
 * (and on /console in development) `site` is '' and paths stay relative; on
 * the console's own host `site` is the main site's origin and every site path
 * becomes absolute (https://autotournament.gg/pricing). Absolute URLs and
 * in-page anchors (#site-links) pass through.
 */
export function siteHref(href: string, site = ''): string {
  if (!site || !href.startsWith('/') || href.startsWith('//')) return href;
  return `${site.replace(/\/$/, '')}${href}`;
}

/**
 * The menus as a host shows them. In the console the account menu on the
 * right replaces the Product menu's Console entry, so it is left out there.
 */
export function menusFor({ site = '', inConsole = false }: { site?: string; inConsole?: boolean } = {}): NavMenu[] {
  return menus.map((m) => ({
    ...m,
    fallbackHref: siteHref(m.fallbackHref, site),
    groups: m.groups.map((g) => ({
      ...g,
      items: g.items.filter((item) => !(inConsole && item.icon === 'console')).map((item) => ({ ...item, href: siteHref(item.href, site) })),
    })),
  }));
}

/**
 * Where the shared panel sits: centred under its trigger, kept `gutter` px
 * inside the header. All values in px, relative to the header's left edge.
 */
export function panelLeft(triggerCenter: number, panelWidth: number, headerWidth: number, gutter = 16): number {
  const max = headerWidth - gutter - panelWidth;
  const left = triggerCenter - panelWidth / 2;
  if (max < gutter) return Math.max(0, (headerWidth - panelWidth) / 2);
  return Math.min(Math.max(left, gutter), max);
}

/** Arrow keys across the bar's items; wraps at both ends. */
export function nextIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
