import { links } from '../links';

/**
 * What the site nav shows. The bar keeps the few things people come for
 * (Pricing, the console, Install); everything else sits in two menus, Product
 * and Resources. Every destination appears exactly once across the bar and
 * the menus: the CS2 status dot in the bar is the only link to
 * /compatibility, licenses and keys live in the console (the bar's Console
 * button), and the Install button is the only link to the install guide.
 * Pure data and helpers, no React, so the tests can read them.
 */

export type NavIcon = 'features' | 'games' | 'pricing' | 'docs' | 'github' | 'discord' | 'console' | 'verify' | 'contact';

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
  id: 'product' | 'resources';
  label: string;
  /** Where the trigger points before the page's script runs. */
  fallbackHref: string;
  groups: NavGroup[];
};

export const menus: NavMenu[] = [
  {
    id: 'product',
    label: 'Product',
    fallbackHref: '/#features',
    groups: [
      {
        heading: 'Product',
        items: [
          { label: 'Features', href: '/#features', note: 'Map veto, server allocation, brackets and stats.', icon: 'features' },
          { label: 'Games', href: '/#games', note: 'CS2 built in. More games as modules.', icon: 'games' },
        ],
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

/** Links that leave the site open in a new tab and carry an arrow. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
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
