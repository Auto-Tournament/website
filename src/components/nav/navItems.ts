import { links } from '../links';

/**
 * What the site nav shows. The bar keeps the few things people come for
 * (Pricing, the console, Install); everything else sits in two menus:
 * Product (what it does and how it is licensed) and Resources (setting it up, community).
 * Pure data and helpers, no React, so the tests can read them.
 */

export type NavIcon = 'features' | 'games' | 'compat' | 'install' | 'docs' | 'licensing' | 'github' | 'discord' | 'console' | 'key' | 'verify' | 'contact';

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
          { label: 'CS2 compatibility', href: links.compatibility, note: 'Does Ready Up work on the latest CS2 build?', icon: 'compat', status: true },
        ],
      },
      {
        heading: 'Licenses',
        items: [
          { label: 'Licensing', href: links.licensing, note: 'What is free, and when you need a license.', icon: 'licensing' },
          { label: 'License keys', href: links.license, note: 'Get your license key again.', icon: 'key' },
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
        heading: 'Set it up',
        items: [
          { label: 'Docs', href: links.docs, note: 'Setup, configuration and the API.', icon: 'docs' },
          { label: 'Install guide', href: links.install, note: 'One Docker Compose file, up in five minutes.', icon: 'install' },
        ],
      },
      {
        heading: 'Community',
        items: [
          { label: 'GitHub', href: links.github, note: 'Source code, issues and releases.', icon: 'github' },
          { label: 'Discord', href: links.discord, note: 'Ask the people who build it.', icon: 'discord' },
          { label: 'Contact', href: links.contact, note: 'Quotes, invoices and free LAN confirmations.', icon: 'contact' },
        ],
      },
    ],
  },
];

/** Plain links: Pricing in the bar; Console and Install on the right. */
export const barLinks = {
  pricing: { label: 'Pricing', href: links.pricing },
  console: { label: 'Console', href: links.account },
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
