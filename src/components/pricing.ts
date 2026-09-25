/**
 * Shared pricing facts for the pricing page and the price calculator.
 * Keep this the single source of truth for prices so the table and the
 * calculator can never drift apart. No 'use client' here: the pricing page
 * (a server component) reads it directly.
 */

export const seatPrices = {
  servers: { event: 3, yearly: 12 },
  platform: { event: 5, yearly: 20 },
} as const;

export type Period = 'event' | 'yearly';

export const periodLabels: Record<Period, string> = {
  event: 'One event (up to 5 days)',
  yearly: 'Yearly (unlimited events)',
};

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

/** What a seat is. Same words in the terms, the docs and the license confirmation. */
export const seatRule = 'No more than N game servers set up at any one time during the period, spares included.';

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

export type PricingRow = {
  use: string;
  personal: string;
  event: string;
  yearly: string;
};

export const pricingTable: PricingRow[] = [
  {
    use: 'MatchZy Enhanced only (MIT, without CS2 Server Manager)',
    personal: 'Free',
    event: 'Free',
    yearly: 'Free',
  },
  {
    use: 'CS2 Server Manager, Ready Up, or both',
    personal: 'Free',
    event: `€${seatPrices.servers.event} per seat`,
    yearly: `€${seatPrices.servers.yearly} per seat`,
  },
  {
    use: 'Auto Tournament platform, with the game packs used with it (includes the row above)',
    personal: 'Free',
    event: `€${seatPrices.platform.event} per seat`,
    yearly: `€${seatPrices.platform.yearly} per seat`,
  },
  {
    use: 'Selling Auto Tournament as a service',
    personal: 'n/a',
    event: 'Custom quote',
    yearly: 'Custom quote',
  },
];
