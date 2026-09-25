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

export const communityDiscount = 0.5;

export const communityEventHelp =
  "For events run by individuals, clubs or informal groups where the entry fee only covers costs (venue, hardware, prizes) and nobody takes a profit. Not for companies, paid organizers, or events that make money. Registered non-profits (schools, charities, public bodies) don't need this: they're free. We may ask for the event's budget or website to confirm.";

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
export type UseType = 'commercial' | 'personal' | 'nonprofit';

export const useTypeLabels: Record<UseType, string> = {
  commercial: 'Commercial (paid events, paid work, business)',
  personal: 'Personal or non-commercial',
  nonprofit: 'Non-profit organization (school, charity, public body)',
};

export const useTypeOrder: UseType[] = ['commercial', 'personal', 'nonprofit'];

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
    use: 'Auto Tournament platform (includes the row above)',
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
