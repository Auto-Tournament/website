/**
 * Pure checkout logic shared by the calculator (client) and /api/checkout
 * (server): tools → product, servers → pack, request validation, the Stripe
 * line item for a pack, and the small abuse limits. No Stripe import and no
 * process.env here, so it runs anywhere and is easy to test.
 *
 * Relative import on purpose: vitest runs this file without the `@/` alias.
 */
import {
  maxPackServers,
  packById,
  packFor,
  packIds,
  type Pack,
  type PackId,
  type PackProduct,
  type Period,
  type ToolOption,
} from '../components/pricing';

export const checkoutTools = ['matchzy', 'csm', 'readyup', 'platform'] as const;
export type CheckoutTool = (typeof checkoutTools)[number];

export const checkoutPeriods = ['event', 'year', 'founder'] as const satisfies readonly Period[];
export type CheckoutPeriod = Period;

export const minServers = 1;
export const maxServers = maxPackServers;
export const maxBodyBytes = 2048;

/** Calculator tool ids → the ids the checkout API takes. */
export const checkoutToolFor: Record<ToolOption, CheckoutTool> = {
  matchzy: 'matchzy',
  serverManager: 'csm',
  readyUp: 'readyup',
  platform: 'platform',
};

/**
 * Which paid product the ticked tools need. The platform includes CS2 Server
 * Manager and Ready Up, so it wins; either of those alone is a Servers pack;
 * MatchZy Enhanced on its own (or nothing) is free, so there is no product.
 */
export function deriveProduct(tools: Iterable<CheckoutTool>): PackProduct | null {
  const set = new Set(tools);
  if (set.has('platform')) return 'platform';
  if (set.has('csm') || set.has('readyup')) return 'servers';
  return null;
}

/** The smallest pack for these tools and servers; null when free or above the biggest pack. */
export function derivePack(tools: Iterable<CheckoutTool>, servers: number): Pack | null {
  const product = deriveProduct(tools);
  return product ? packFor(product, servers) : null;
}

export type CheckoutRequest = {
  pack: PackId;
  period: CheckoutPeriod;
  servers: number;
  tools: CheckoutTool[];
  use: 'commercial';
};

export type Validation = { ok: true; value: CheckoutRequest } | { ok: false; error: string };

const requestKeys = ['pack', 'period', 'servers', 'tools', 'use'] as const;

const includes = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

/**
 * Strict: every key present, no extra keys, exact types and values. The server
 * derives the product from the tools and the pack size from the servers, and
 * the pack the client sends must equal that. The price never comes from the
 * client.
 */
export function validateCheckoutRequest(body: unknown): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });

  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('Expected a JSON object.');
  const obj = body as Record<string, unknown>;

  const keys = Object.keys(obj);
  if (keys.length !== requestKeys.length || !requestKeys.every((k) => Object.prototype.hasOwnProperty.call(obj, k))) {
    return fail('Unexpected or missing fields.');
  }

  const { pack, period, servers, tools, use } = obj;

  if (!includes(packIds, pack)) return fail('Invalid pack.');
  if (!includes(checkoutPeriods, period)) return fail('Invalid period.');
  if (typeof servers !== 'number' || !Number.isInteger(servers) || servers < minServers) {
    return fail(`Servers must be a whole number from ${minServers} to ${maxServers}.`);
  }
  if (servers > maxServers) return fail(`More than ${maxServers} servers is a custom quote. Email us instead.`);
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > checkoutTools.length) return fail('Invalid tools.');
  if (!tools.every((t) => includes(checkoutTools, t))) return fail('Invalid tools.');
  if (new Set(tools).size !== tools.length) return fail('Invalid tools.');
  if (use !== 'commercial') return fail('Only commercial use is paid; non-commercial use and non-profit organizations are free.');

  const typedTools = tools as CheckoutTool[];
  if (deriveProduct(typedTools) === null) return fail('These tools need no paid license.');
  const derived = derivePack(typedTools, servers);
  if (derived === null) return fail('Invalid servers.');
  if (derived.id !== pack) return fail('Pack does not match the tools and servers.');

  // Canonical order, so metadata reads the same whatever order the client sent.
  const sorted = checkoutTools.filter((t) => typedTools.includes(t));
  return { ok: true, value: { pack: derived.id, period, servers, tools: sorted, use } };
}

/** The pack price from pricing.ts, in euro cents. */
export function unitAmountCents(pack: PackId, period: CheckoutPeriod): number {
  return packById(pack).prices[period];
}

const periodInName: Record<CheckoutPeriod, string> = {
  event: 'per event',
  year: 'yearly',
  founder: 'founding supporter',
};

/** Stripe product name: "Servers L license — per event (up to 40 servers)". */
export function lineItemName(pack: PackId, period: CheckoutPeriod): string {
  const p = packById(pack);
  return `${p.name} license — ${periodInName[period]} (up to ${p.maxServers} servers)`;
}

const coveredSoftware: Record<PackProduct, string> = {
  servers: 'CS2 Server Manager and Ready Up',
  platform: 'Auto Tournament platform, CS2 Server Manager, Ready Up and the game packs used with it',
};

const periodInDescription: Record<CheckoutPeriod, string> = {
  event: 'One event, up to 5 days in a row',
  year: '12 months, unlimited events of the licensee',
  founder: 'Perpetual commercial use of versions released within 12 months of purchase, including 1 year of updates',
};

export function lineItemDescription(pack: PackId, period: CheckoutPeriod): string {
  const p = packById(pack);
  return `${coveredSoftware[p.product]}. No more than ${p.maxServers} game servers set up at any one time, spares included. ${periodInDescription[period]}.`;
}

/**
 * Inline price for Stripe Checkout, so no products or prices need to exist in
 * Stripe. Quantity is always 1: a pack is one fixed price.
 */
export function lineItem(req: Pick<CheckoutRequest, 'pack' | 'period'>) {
  return {
    price_data: {
      currency: 'eur' as const,
      unit_amount: unitAmountCents(req.pack, req.period),
      tax_behavior: 'exclusive' as const,
      product_data: {
        name: lineItemName(req.pack, req.period),
        description: lineItemDescription(req.pack, req.period),
      },
    },
    quantity: 1,
  };
}

export function describeLicense(req: Pick<CheckoutRequest, 'pack' | 'period'>): string {
  return `Auto Tournament ${lineItemName(req.pack, req.period)}`;
}

/**
 * Founder packs are limited to the first 25 buyers or until 31 March 2027. The
 * limit is not enforced here: the owner counts founder orders (metadata
 * founder=true) by hand before sending the license and refunds any past it.
 */
export function licenseMetadata(req: CheckoutRequest): Record<string, string> {
  return {
    pack: req.pack,
    period: req.period,
    servers: String(req.servers),
    tools: req.tools.join(','),
    ...(req.period === 'founder' ? { founder: 'true' } : {}),
  };
}

/** Stripe Checkout allows at most 3 custom fields, each label at most 50 characters. */
export const stripeMaxCustomFields = 3;
export const stripeMaxLabelLength = 50;

/**
 * The B2B confirmation. Stripe has no checkbox custom field, so it is a
 * required dropdown with one option: the buyer can't pay without choosing it.
 */
export const businessBuyerField = {
  key: 'buyertype',
  label: "I'm buying for a business, not as a consumer",
  optionLabel: 'Yes, for a business or organization',
  optionValue: 'business',
} as const;

/**
 * The parts of the Checkout Session that set up the form: who the buyer is,
 * the event, and acceptance of the terms. Structural types only (no Stripe
 * import); the route passes the result straight to Stripe.
 *
 * - The business name is Stripe's own field, made required. It isn't a custom
 *   "Company name" field too, because custom fields are capped at 3.
 * - Terms acceptance needs the Terms of service URL set in the Stripe
 *   Dashboard (Settings → Public details), or session creation fails.
 */
export function checkoutFormParams(base: string) {
  return {
    billing_address_collection: 'required' as const,
    tax_id_collection: { enabled: true },
    name_collection: { business: { enabled: true, optional: false } },
    consent_collection: { terms_of_service: 'required' as const },
    custom_text: {
      terms_of_service_acceptance: {
        message: `I accept the [Commercial License Terms](${base}/terms) and the [Terms of Sale](${base}/terms-of-sale).`,
      },
    },
    custom_fields: [
      {
        key: businessBuyerField.key,
        label: { type: 'custom' as const, custom: businessBuyerField.label },
        type: 'dropdown' as const,
        dropdown: { options: [{ label: businessBuyerField.optionLabel, value: businessBuyerField.optionValue }] },
        optional: false,
      },
      {
        // Stripe keys must be alphanumeric, so no underscores.
        key: 'eventdates',
        label: { type: 'custom' as const, custom: 'Event date(s), or start date if yearly or founder' },
        type: 'text' as const,
        optional: false,
      },
      {
        // Paid operators must name the event or client they work for.
        key: 'eventname',
        label: { type: 'custom' as const, custom: 'Event or client name, and website' },
        type: 'text' as const,
        optional: false,
      },
    ],
  };
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
