/**
 * Shared pricing facts for the pricing page and the price calculator. No
 * 'use client' here: the pricing page (a server component) reads it directly.
 *
 * Stripe is the source of truth for the pack prices and server limits: the
 * pricing page and /api/checkout read them through src/lib/stripePrices.ts and
 * pass them around as `Pack[]`. FALLBACK_PACKS below is only shown when Stripe
 * is unreachable or not configured, and card checkout is off while it is (see
 * scripts/stripe-seed-packs.mjs to change a price).
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

export const periods: readonly Period[] = ['event', 'year', 'founder'];

/** The six packs, smallest first within each product. Ids, products and sizes are fixed; the numbers come from Stripe. */
export const packDefs: readonly Pick<Pack, 'id' | 'product' | 'size' | 'name'>[] = [
  { id: 'servers-s', product: 'servers', size: 'S', name: 'Servers S' },
  { id: 'servers-m', product: 'servers', size: 'M', name: 'Servers M' },
  { id: 'servers-l', product: 'servers', size: 'L', name: 'Servers L' },
  { id: 'platform-s', product: 'platform', size: 'S', name: 'Platform S' },
  { id: 'platform-m', product: 'platform', size: 'M', name: 'Platform M' },
  { id: 'platform-l', product: 'platform', size: 'L', name: 'Platform L' },
];

/**
 * Fallback only, for when Stripe is unreachable or unconfigured: the page
 * still shows prices, but checkout answers 503. Keep it close to Stripe so
 * the fallback page doesn't mislead. Same order as packDefs.
 */
export const FALLBACK_PACKS: readonly Pack[] = [
  { id: 'servers-s', product: 'servers', size: 'S', name: 'Servers S', maxServers: 6, prices: { event: 1900, year: 4900, founder: 14900 } },
  { id: 'servers-m', product: 'servers', size: 'M', name: 'Servers M', maxServers: 20, prices: { event: 5900, year: 14900, founder: 44900 } },
  { id: 'servers-l', product: 'servers', size: 'L', name: 'Servers L', maxServers: 40, prices: { event: 9900, year: 27900, founder: 84900 } },
  { id: 'platform-s', product: 'platform', size: 'S', name: 'Platform S', maxServers: 6, prices: { event: 3900, year: 9900, founder: 29900 } },
  { id: 'platform-m', product: 'platform', size: 'M', name: 'Platform M', maxServers: 20, prices: { event: 9900, year: 24900, founder: 74900 } },
  { id: 'platform-l', product: 'platform', size: 'L', name: 'Platform L', maxServers: 40, prices: { event: 15900, year: 42900, founder: 129900 } },
];

export const packIds: readonly PackId[] = packDefs.map((p) => p.id);

/** The biggest pack's limit. Above this it's a custom quote. */
export function maxPackServers(packs: readonly Pack[]): number {
  return Math.max(...packs.map((p) => p.maxServers));
}

export function packIn(packs: readonly Pack[], id: PackId): Pack {
  const pack = packs.find((p) => p.id === id);
  if (!pack) throw new Error(`Unknown pack ${id}`);
  return pack;
}

/** The smallest pack of this product that allows `servers`; null above the biggest pack. */
export function packFor(packs: readonly Pack[], product: PackProduct, servers: number): Pack | null {
  return (
    packs
      .filter((p) => p.product === product && p.maxServers >= servers)
      .reduce<Pack | null>((best, p) => (best === null || p.maxServers < best.maxServers ? p : best), null)
  );
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
  S: 'Small LAN: one tournament, plus a spare or practice server',
  M: 'Mid-size LAN: a few tournaments at once, plus practice and spare servers',
  L: 'Big LAN: many tournaments at once, plus practice and spare servers',
};

export const popularSize: PackSize = 'M';

export const periodLabels: Record<Period, string> = {
  event: 'One event (up to 5 days in a row)',
  year: 'Yearly (12 months, unlimited events)',
  founder: 'Founding supporter (one-off, lifetime updates)',
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

export const pricingVersion = 'Pricing v3, valid from 28 September 2026';

/** The pack rules. Same words on the pricing page; /terms and the docs say the same. */
export function packRules(packs: readonly Pack[]): string[] {
  return [
    'One pack per event, or per 12 months for yearly.',
    'Packs can\'t be combined or stacked: two S packs don\'t make an M. Servers and Platform can\'t be combined either; Platform already includes the servers.',
    `${yearlyUpdates} ${yearlyAfterExpiry}`,
    'Need more servers during the period? Email us to upgrade to the next size and pay the difference.',
    eventCreditRule,
    operatorRule,
    testServersRule,
    `More than ${maxPackServers(packs)} servers, or hosting for many clients at once: contact us for a custom quote.`,
    `${priceChangeRule} ${noAutoRenew}`,
  ];
}

/**
 * Yearly: all updates for 12 months. Without renewal the buyer keeps commercial
 * use of each version line (major.minor) that started during the paid year,
 * later patch releases of those lines included. Same words in /terms section 8.
 */
export const yearlyUpdates = 'Yearly includes all updates for 12 months.';
export const yearlyAfterExpiry =
  "If you don't renew, you keep commercial use of every version line (such as 1.4) that started on or before the last day of your paid year, including its later patches (1.4.1, 1.4.2…). New minor and major versions (1.5, 2.0) need active updates; renewing restores them.";
export const yearlyCs2Note =
  'CS2 compatibility fixes ship as patches of the current version line, so after your year ends you get them only for lines that started on or before the last day of your paid year.';

/** An event pack counts toward a yearly pack bought soon after. */
export const eventCreditRule =
  'Bought an event pack in the last 90 days? Its full price counts toward a yearly pack of the same product and size.';

/** Paid operators and contractors (e.g. someone hired to run the servers at a LAN). */
export const operatorRule =
  'Yearly and founding supporter packs also cover events you operate for clients, such as a LAN that hires you to run its servers. The server limit applies at any one time, and we may ask which events you ran.';

/** Which servers count toward the limit. */
export const testServersRule =
  'Only servers used for the paid activity count, spares included. Test, staging and CI servers are free.';

/** Price changes never touch what you already bought. */
export const priceChangeRule =
  'Price changes apply to new purchases and renewals only, never to a running period or a founding supporter pack.';
export const noAutoRenew = 'Yearly packs never renew automatically.';

/**
 * Founding supporter: pay once, lifetime updates. Limited, and checked by hand
 * when an order comes in. The same words are on the pricing page and in /terms.
 */
export const founderLimit = 25;
export const founderDeadline = '31 March 2027';
export const founderBadge = `Limited: first ${founderLimit} or until ${founderDeadline}`;
/** Last day founder packs are sold (inclusive), as YYYY-MM-DD. Same day as founderDeadline. */
export const founderLastDay = '2027-03-31';
export const founderClosedBadge = 'Sold out';

/** Whether checkout still sells founder packs: fewer than founderLimit sold and not past founderLastDay (UTC). */
export function founderSalesOpen(sold: number, now: Date = new Date()): boolean {
  return sold < founderLimit && now.toISOString().slice(0, 10) <= founderLastDay;
}

/** What "lifetime" means. Used on the pricing page, the calculator and /terms. */
export const founderLifetime =
  'for as long as we sell the software your pack covers, including new major versions and renamed successors of it';

/** The one-line pitch: founder strip and calculator. */
export const founderPitch = `Pay once and get lifetime updates: every new version, ${founderLifetime}. No yearly fee.`;

export const founderUpdateWarning = 'CS2 updates can break older versions; install our updates to stay current';

/** The shutdown promise, for every founding supporter (lifetime) license. */
export const founderShutdownPromise =
  'If we ever stop selling it (not offered for a full year), you keep every version you have, nothing can lock you out, and we release a final build without the license check.';

/**
 * How licenses are enforced: on trust. Nothing ever blocks. Keep this true
 * before changing the words: no license check may stop the software.
 */
export const neverLockOut =
  'We never lock you out. A license check never stops the software; at most it shows a warning when a version is newer than the updates your license covers.';

/** Moving a founder pack to a bigger size: the founder price difference, e.g. Servers M → L. */
export function founderUpgradeExample(packs: readonly Pack[], product: PackProduct = 'servers'): string {
  const m = packIn(packs, `${product}-m`);
  const l = packIn(packs, `${product}-l`);
  return `${m.name} to ${l.name} costs ${formatEuro(l.prices.founder - m.prices.founder)}`;
}

export function founderTerms(packs: readonly Pack[]): string[] {
  return [
    `Only for the first ${founderLimit} buyers, or until ${founderDeadline}, whichever comes first.`,
    `Pay once. Commercial use of every version we release, ${founderLifetime}: lifetime updates, no yearly fee.`,
    'Updates means every new version of the software in your pack: fixes, CS2 compatibility updates and new features.',
    `The pack size is fixed. While founding supporter sales are open you can move to a bigger size by paying the difference between the founder prices (${founderUpgradeExample(packs)}); after that, a bigger size is a yearly pack.`,
    'The license is for the named licensee and can\'t be resold or transferred.',
    founderShutdownPromise,
  ];
}

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

export const vatNote =
  "Prices exclude VAT. We're not VAT-registered, so no VAT is charged today. If we register, VAT is added to new purchases and renewals at the applicable rate.";

/** Short form next to prices. */
export const vatShort = 'excl. VAT';

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
