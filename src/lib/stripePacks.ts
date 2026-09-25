/**
 * Turns Stripe's price list into the packs the pricing page and checkout use,
 * and rejects anything that doesn't look exactly like what
 * scripts/stripe-seed-packs.mjs creates. Pure: no Stripe client and no
 * process.env, so it is easy to test. The fetching and caching are in
 * stripePrices.ts.
 *
 * Relative import on purpose: vitest runs this file without the `@/` alias.
 */
import type Stripe from 'stripe';
import { packDefs, periods, type Pack, type PackId, type Period } from '../components/pricing';

/** "servers-l" + "event" → "servers_l_event". Same keys as the seed script. */
export function lookupKey(pack: PackId, period: Period): string {
  return `${pack.replace('-', '_')}_${period}`;
}

/** All 18 lookup keys, in pack then period order. */
export const allLookupKeys: readonly string[] = packDefs.flatMap((p) => periods.map((period) => lookupKey(p.id, period)));

/** Stripe's prices.list takes at most 10 lookup keys per call. */
export const lookupKeysPerRequest = 10;

export function chunkLookupKeys(keys: readonly string[] = allLookupKeys, size = lookupKeysPerRequest): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += size) chunks.push(keys.slice(i, i + size));
  return chunks;
}

/** Sanity cap on a pack's server limit; anything above is a typo in the metadata. */
const maxServersCap = 10_000;

export type StripePacks = {
  packs: Pack[];
  /** Lookup key → Stripe price id. Server only: never passed to the client. */
  priceIds: Record<string, string>;
};

export type StripePacksResult = { ok: true; value: StripePacks } | { ok: false; errors: string[] };

/** Only the fields we read, so tests can build prices by hand. */
export type StripePriceLike = Pick<
  Stripe.Price,
  | 'id'
  | 'active'
  | 'billing_scheme'
  | 'currency'
  | 'custom_unit_amount'
  | 'lookup_key'
  | 'recurring'
  | 'tax_behavior'
  | 'transform_quantity'
  | 'type'
  | 'unit_amount'
> & {
  product: string | Pick<Stripe.Product, 'id' | 'active' | 'metadata'> | Stripe.DeletedProduct;
};

function parseMaxServers(raw: string | undefined): number | null {
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n <= maxServersCap ? n : null;
}

/**
 * Maps the active prices for allLookupKeys (with `data.product` expanded)
 * into packs. Every problem is collected; any problem means the whole result
 * is unusable, so the caller falls back and card checkout stays off.
 */
export function packsFromStripePrices(prices: readonly StripePriceLike[]): StripePacksResult {
  const errors: string[] = [];
  const byKey = new Map<string, StripePriceLike>();
  for (const price of prices) {
    if (!price.lookup_key || !allLookupKeys.includes(price.lookup_key)) continue;
    if (byKey.has(price.lookup_key)) {
      errors.push(`${price.lookup_key}: more than one price`);
      continue;
    }
    byKey.set(price.lookup_key, price);
  }

  const packs: Pack[] = [];
  const priceIds: Record<string, string> = {};

  for (const def of packDefs) {
    const amounts: Partial<Record<Period, number>> = {};
    let maxServers: number | null = null;
    let productId: string | null = null;

    for (const period of periods) {
      const key = lookupKey(def.id, period);
      const price = byKey.get(key);
      if (!price) {
        errors.push(`${key}: missing (no active price with this lookup key)`);
        continue;
      }
      const bad = (why: string) => errors.push(`${key} (${price.id}): ${why}`);
      const before = errors.length;

      if (price.active !== true) bad('not active');
      if (price.currency !== 'eur') bad(`currency ${price.currency}, expected eur`);
      if (price.type !== 'one_time' || price.recurring !== null) bad('not a one-time price');
      if (price.billing_scheme !== 'per_unit') bad('not a per-unit price');
      if (price.custom_unit_amount !== null) bad('customer chooses the amount');
      if (price.transform_quantity !== null) bad('transforms the quantity');
      if (price.tax_behavior !== 'exclusive') bad(`tax_behavior ${price.tax_behavior}, expected exclusive`);
      if (typeof price.unit_amount !== 'number' || !Number.isSafeInteger(price.unit_amount) || price.unit_amount <= 0) {
        bad('unit_amount is not a positive whole number of cents');
      }

      const product = price.product;
      if (typeof product !== 'object' || product === null) {
        bad('product not expanded');
      } else if ('deleted' in product && product.deleted) {
        bad('product deleted');
      } else if (!('metadata' in product)) {
        bad('product not expanded');
      } else {
        if (product.active !== true) bad(`product ${product.id} archived`);
        if (product.metadata?.pack_id !== def.id) bad(`product ${product.id} metadata.pack_id is ${JSON.stringify(product.metadata?.pack_id)}, expected ${def.id}`);
        if (productId !== null && product.id !== productId) bad(`product ${product.id} differs from the other ${def.id} prices (${productId})`);
        productId ??= product.id;
        const parsed = parseMaxServers(product.metadata?.max_servers);
        if (parsed === null) bad(`product ${product.id} metadata.max_servers ${JSON.stringify(product.metadata?.max_servers)} is not a whole number from 1 to ${maxServersCap}`);
        else maxServers ??= parsed;
      }

      if (errors.length === before) {
        amounts[period] = price.unit_amount as number;
        priceIds[key] = price.id;
      }
    }

    if (maxServers !== null && periods.every((p) => amounts[p] !== undefined)) {
      packs.push({ ...def, maxServers, prices: amounts as Record<Period, number> });
    }
  }

  // S < M < L within each product, or "the smallest pack that fits" is wrong.
  for (const product of ['servers', 'platform'] as const) {
    const sizes = packs.filter((p) => p.product === product);
    for (let i = 1; i < sizes.length; i++) {
      if (!(sizes[i].maxServers > sizes[i - 1].maxServers)) {
        errors.push(`${sizes[i].id}: max_servers ${sizes[i].maxServers} is not above ${sizes[i - 1].id} (${sizes[i - 1].maxServers})`);
      }
    }
  }

  if (errors.length > 0 || packs.length !== packDefs.length) {
    return { ok: false, errors: errors.length > 0 ? errors : ['incomplete price list'] };
  }
  return { ok: true, value: { packs, priceIds } };
}
