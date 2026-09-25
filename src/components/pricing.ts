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

export type UsageOption = keyof typeof seatPrices;

export const usageLabels: Record<UsageOption, string> = {
  servers: 'CS2 Server Manager and/or Ready Up',
  platform: 'Auto Tournament platform',
};

export type Period = 'event' | 'yearly';

export const periodLabels: Record<Period, string> = {
  event: 'One event (up to 5 days)',
  yearly: 'Yearly (unlimited events)',
};

export const communityDiscount = 0.5;

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
