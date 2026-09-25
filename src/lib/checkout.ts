/**
 * Pure checkout logic shared by the calculator (client) and /api/checkout
 * (server): tool → license option, request validation, the Stripe product and
 * price each option must match, and the small abuse limits. No Stripe import
 * and no process.env here, so it runs anywhere and is easy to test.
 *
 * Relative import on purpose: vitest runs this file without the `@/` alias.
 */
import { seatPrices, type ToolOption } from '../components/pricing';

export const checkoutTools = ['matchzy', 'csm', 'readyup', 'platform'] as const;
export type CheckoutTool = (typeof checkoutTools)[number];

export const checkoutOptions = ['servers', 'platform'] as const;
export type CheckoutOption = (typeof checkoutOptions)[number];

export const checkoutPeriods = ['event', 'year'] as const;
export type CheckoutPeriod = (typeof checkoutPeriods)[number];

export const minSeats = 1;
export const maxSeats = 500;
export const maxBodyBytes = 2048;

/** Calculator tool ids → the ids the checkout API takes. */
export const checkoutToolFor: Record<ToolOption, CheckoutTool> = {
  matchzy: 'matchzy',
  serverManager: 'csm',
  readyUp: 'readyup',
  platform: 'platform',
};

/**
 * Which paid license the ticked tools need. The platform includes CS2 Server
 * Manager and Ready Up, so it wins; either of those alone is the servers rate;
 * MatchZy Enhanced on its own (or nothing) is free, so there is no option.
 */
export function deriveOption(tools: Iterable<CheckoutTool>): CheckoutOption | null {
  const set = new Set(tools);
  if (set.has('platform')) return 'platform';
  if (set.has('csm') || set.has('readyup')) return 'servers';
  return null;
}

export type CheckoutRequest = {
  option: CheckoutOption;
  period: CheckoutPeriod;
  seats: number;
  tools: CheckoutTool[];
  use: 'commercial';
  community: boolean;
};

export type Validation = { ok: true; value: CheckoutRequest } | { ok: false; error: string };

const requestKeys = ['option', 'period', 'seats', 'tools', 'use', 'community'] as const;

const includes = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

/**
 * Strict: every key present, no extra keys, exact types and values. The option
 * the client sends must equal the one derived from its tools; the price never
 * comes from the client.
 */
export function validateCheckoutRequest(body: unknown): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });

  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('Expected a JSON object.');
  const obj = body as Record<string, unknown>;

  const keys = Object.keys(obj);
  if (keys.length !== requestKeys.length || !requestKeys.every((k) => Object.prototype.hasOwnProperty.call(obj, k))) {
    return fail('Unexpected or missing fields.');
  }

  const { option, period, seats, tools, use, community } = obj;

  if (!includes(checkoutOptions, option)) return fail('Invalid option.');
  if (!includes(checkoutPeriods, period)) return fail('Invalid period.');
  if (typeof seats !== 'number' || !Number.isInteger(seats) || seats < minSeats || seats > maxSeats) {
    return fail(`Seats must be a whole number from ${minSeats} to ${maxSeats}.`);
  }
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > checkoutTools.length) return fail('Invalid tools.');
  if (!tools.every((t) => includes(checkoutTools, t))) return fail('Invalid tools.');
  if (new Set(tools).size !== tools.length) return fail('Invalid tools.');
  if (use !== 'commercial') return fail('Only commercial use is paid; personal and non-profit use are free.');
  if (typeof community !== 'boolean') return fail('Invalid community flag.');

  const typedTools = tools as CheckoutTool[];
  const derived = deriveOption(typedTools);
  if (derived === null) return fail('These tools need no paid license.');
  if (derived !== option) return fail('Option does not match the tools.');

  // Canonical order, so metadata reads the same whatever order the client sent.
  const sorted = checkoutTools.filter((t) => typedTools.includes(t));
  return { ok: true, value: { option: derived, period, seats, tools: sorted, use, community } };
}

/** Exact Stripe product names, one active one-time EUR per-unit price each. */
export const stripeProductNames: Record<CheckoutOption, Record<CheckoutPeriod, string>> = {
  servers: { event: 'Servers license: per event', year: 'Servers license: yearly' },
  platform: { event: 'Platform license: per event', year: 'Platform license: yearly' },
};

/** The seat price from pricing.ts, in euro cents. */
export function unitAmountCents(option: CheckoutOption, period: CheckoutPeriod): number {
  return Math.round(seatPrices[option][period === 'year' ? 'yearly' : 'event'] * 100);
}

export function describeLicense(req: Pick<CheckoutRequest, 'option' | 'period' | 'seats'>): string {
  const period = req.period === 'year' ? 'yearly' : 'per event';
  return `Auto Tournament license: ${req.option}, ${period}, ${req.seats} ${req.seats === 1 ? 'seat' : 'seats'}`;
}

export function licenseMetadata(req: CheckoutRequest): Record<string, string> {
  return {
    option: req.option,
    period: req.period,
    seats: String(req.seats),
    tools: req.tools.join(','),
    community: String(req.community),
  };
}

/** The fields of a Stripe Price the checkout relies on (structural, so tests need no Stripe). */
export type PriceLike = {
  id: string;
  active: boolean;
  currency: string;
  type: string;
  unit_amount: number | null;
  billing_scheme?: string;
  transform_quantity?: unknown;
  product: string | { name?: unknown; active?: unknown; deleted?: unknown; default_price?: unknown };
};

/**
 * Picks the Stripe price for an option and period, or null when nothing
 * matches every check: product name exact, product and price active, EUR,
 * one-time, per unit, no quantity transform, and the amount equal to
 * pricing.ts. Prefers the product's default price when several qualify.
 */
export function pickPrice<P extends PriceLike>(prices: readonly P[], option: CheckoutOption, period: CheckoutPeriod): P | null {
  const name = stripeProductNames[option][period];
  const cents = unitAmountCents(option, period);
  const matches = prices.filter((p) => {
    const product = p.product;
    if (typeof product !== 'object' || product === null) return false;
    return (
      product.deleted !== true &&
      product.active === true &&
      product.name === name &&
      p.active === true &&
      p.currency === 'eur' &&
      p.type === 'one_time' &&
      p.unit_amount === cents &&
      (p.billing_scheme === undefined || p.billing_scheme === 'per_unit') &&
      (p.transform_quantity === undefined || p.transform_quantity === null)
    );
  });
  if (matches.length === 0) return null;
  const defaultId = (p: P) => {
    const d = typeof p.product === 'object' ? p.product.default_price : undefined;
    return typeof d === 'string' ? d : typeof d === 'object' && d !== null && 'id' in d ? (d as { id: unknown }).id : undefined;
  };
  return matches.find((p) => defaultId(p) === p.id) ?? matches[0];
}

/** Client IP behind the Cloudflare tunnel; falls back to the first X-Forwarded-For hop. */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return xff || 'unknown';
}

/**
 * Sliding-window limiter kept in memory (one container, so that is enough).
 * Returns true when the request is allowed.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.delete(key);
    hits.set(key, recent);
    // Bound memory: drop the least recently seen keys.
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
    return true;
  };
}
