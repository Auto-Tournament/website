/**
 * Shared pricing facts for the pricing page and the price calculator.
 * Keep this the single source of truth for prices so the table and the
 * calculator can never drift apart. No 'use client' here: the pricing page
 * (a server component) reads it directly.
 */

/** Which software a pack covers. */
export type PackProduct = 'servers' | 'platform';
export type PackSize = 'S' | 'M' | 'L';
/** How long a pack runs. Same ids as /api/checkout takes. */
export type Period = 'event' | 'year' | 'founder';
export type PackId = 'servers-s' | 'servers-m' | 'servers-l' | 'platform-s' | 'platform-m' | 'platform-l';

export type Pack = {
  id: PackId;
  product: PackProduct;
  size: PackSize;
  /** "Servers L", "Platform S". */
  name: string;
  /** Most game servers set up at any one time during the period, spares included. */
  maxServers: number;
  /** Prices in euro cents. */
  prices: Record<Period, number>;
};

/**
 * Pricing v2: fixed packs, not per seat. Ordered smallest first within each
 * product, so the first pack that fits is the cheapest one.
 */
export const PACKS: readonly Pack[] = [
  { id: 'servers-s', product: 'servers', size: 'S', name: 'Servers S', maxServers: 5, prices: { event: 1900, year: 4900, founder: 7900 } },
  { id: 'servers-m', product: 'servers', size: 'M', name: 'Servers M', maxServers: 15, prices: { event: 4900, year: 12900, founder: 19900 } },
  { id: 'servers-l', product: 'servers', size: 'L', name: 'Servers L', maxServers: 40, prices: { event: 9900, year: 27900, founder: 39900 } },
  { id: 'platform-s', product: 'platform', size: 'S', name: 'Platform S', maxServers: 5, prices: { event: 3900, year: 9900, founder: 14900 } },
  { id: 'platform-m', product: 'platform', size: 'M', name: 'Platform M', maxServers: 15, prices: { event: 7900, year: 21900, founder: 32900 } },
  { id: 'platform-l', product: 'platform', size: 'L', name: 'Platform L', maxServers: 40, prices: { event: 14900, year: 42900, founder: 59900 } },
];

export const packIds = PACKS.map((p) => p.id);

/** The biggest pack. Above this it's a custom quote. */
export const maxPackServers = Math.max(...PACKS.map((p) => p.maxServers));

export function packById(id: PackId): Pack {
  const pack = PACKS.find((p) => p.id === id);
  if (!pack) throw new Error(`Unknown pack ${id}`);
  return pack;
}

/** The smallest pack of this product that allows `servers`; null above the biggest pack. */
export function packFor(product: PackProduct, servers: number): Pack | null {
  return PACKS.find((p) => p.product === product && p.maxServers >= servers) ?? null;
}

export const productLabels: Record<PackProduct, string> = {
  servers: 'CS2 Server Manager and/or Ready Up',
  platform: 'The Auto Tournament platform, CS2 Server Manager, Ready Up and the game packs used with it',
};

/** The Servers / Platform toggle: a short name and one line on what it covers. */
export const productIntro: Record<PackProduct, { title: string; line: string }> = {
  servers: { title: 'Servers', line: 'CS2 Server Manager and/or Ready Up, on game servers you run.' },
  platform: { title: 'Platform', line: 'The full Auto Tournament platform, with CS2 Server Manager, Ready Up and the game packs included.' },
};

/** What each size fits, on the pack cards. */
export const packGoodFor: Record<PackSize, string> = {
  S: 'Local LAN, up to ~200 people',
  M: 'Regional LAN or a big CS2 tournament',
  L: 'Large multi-game LAN',
};

export const popularSize: PackSize = 'M';

export const periodLabels: Record<Period, string> = {
  event: 'One event (up to 5 days in a row)',
  year: 'Yearly (12 months, unlimited events)',
  founder: 'Founding supporter (one-off)',
};

/** Short period words for prices: "€99 per event". */
export const periodPriceSuffix: Record<Period, string> = {
  event: 'per event',
  year: 'a year',
  founder: 'one-off',
};

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Whole-euro price from cents: 9900 → "€99". */
export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

export const pricingVersion = 'Pricing v2, valid from 25 September 2026';

/** The pack rules. Same words on the pricing page; /terms and the docs say the same. */
export const packRules: string[] = [
  'One pack per event, or per 12 months for yearly.',
  'Packs can\'t be combined or stacked: two S packs don\'t make an M. Servers and Platform can\'t be combined either; Platform already includes the servers.',
  'Need more servers during the period? Email us to upgrade to the next size and pay the difference.',
  `More than ${maxPackServers} servers: contact us for a custom quote.`,
];

/** Founding supporter: limited, and checked by hand when an order comes in. */
export const founderLimit = 25;
export const founderDeadline = '31 March 2027';
export const founderBadge = `Limited: first ${founderLimit} or until ${founderDeadline}`;
export const founderUpdateWarning = 'CS2 updates can break older versions; renew updates to stay current';

export const founderTerms: string[] = [
  `Only for the first ${founderLimit} buyers, or until ${founderDeadline}, whichever comes first.`,
  'Perpetual commercial use of every version released within 12 months of purchase, including 1 year of updates.',
  `After that, renewing updates is optional, at the yearly price of the same pack (for example Servers L at ${formatEuro(packById('servers-l').prices.year)} a year), and renewing restores updates.`,
  'Without renewal you keep using the versions from your first 12 months.',
  'The server limit stays the pack\'s limit. To move to a bigger founder pack, pay the difference while founder packs are still available.',
];

/**
 * The rule behind every price: if you earn money from it, you pay full price.
 * Shown in the calculator's "?" next to the free option.
 */
export const freeUseHelp =
  'Free when nobody earns money from it: all entry fees and sponsor money go back into the event, and no organizer, volunteer or helper is paid or takes profit.';

/** The organizations PolyForm Noncommercial 1.0.0 lets use the software free, in plain words. */
export const freeOrganizations =
  'Charities, schools and universities, public research, public safety or health and environmental protection organizations, and government bodies are free, even when they charge entry.';

/** Who pays: anyone who earns money from it, at the full price. */
export const earnMoneyRule =
  'If you earn money from it, you pay full price: an organizer who makes a profit, any business, or a paid operator or contractor, even one hired by a zero-profit event.';

/**
 * The optional free LAN confirmation. PolyForm already allows non-commercial
 * use, so this is only for organizers who want it in writing.
 */
export function freeLanMailto(email: string): string {
  const subject = 'Free LAN confirmation: <event>';
  const body = [
    "Hi, we're running a zero-profit LAN and would like a free confirmation in writing.",
    '',
    'Event name: ',
    'Date(s): ',
    'Website or social link: ',
    'Organizer (name / club): ',
    'Roughly how many servers: ',
    'How entry fees and sponsor money are used: ',
    'Is anyone paid (organizers, volunteers, helpers, operators)? ',
  ].join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** What the pack size means. Same words in the terms, the docs and the license confirmation. */
export const serverLimitRule = 'A pack allows no more than its number of game servers set up at any one time during the period, spares included.';

export const vatNote = 'No VAT added (seller not VAT-registered)';

/** Tools someone ticks in "What will you run?". */
export type ToolOption = 'matchzy' | 'serverManager' | 'readyUp' | 'platform';

export const toolLabels: Record<ToolOption, string> = {
  matchzy: 'MatchZy Enhanced (MIT CS2 plugin)',
  serverManager: 'CS2 Server Manager',
  readyUp: 'Ready Up (native CS2 plugin)',
  platform: 'Auto Tournament platform',
};

export const toolOrder: ToolOption[] = ['matchzy', 'serverManager', 'readyUp', 'platform'];

/** Who the license is for. */
export type UseType = 'commercial' | 'noncommercial' | 'nonprofit';

export const useTypeLabels: Record<UseType, string> = {
  commercial: 'Commercial (someone earns money)',
  noncommercial: 'Non-commercial: nobody earns money (free)',
  nonprofit: 'Non-profit organization (free)',
};

export const useTypeOrder: UseType[] = ['commercial', 'noncommercial', 'nonprofit'];
