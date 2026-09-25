import 'server-only';
import Stripe from 'stripe';
import { FALLBACK_PACKS, type Pack } from '@/components/pricing';
import { chunkLookupKeys, packsFromStripePrices, type StripePacks } from '@/lib/stripePacks';

/**
 * Pack prices and server limits from Stripe, the source of truth. Read with
 * STRIPE_SECRET_KEY (a restricted key with Prices read and Products read),
 * cached in memory for 5 minutes, and the last good result is kept when a
 * refresh fails.
 *
 * With no key, or when Stripe has never answered with a valid price list,
 * this returns FALLBACK_PACKS from pricing.ts with source 'fallback': the page
 * still shows prices, but /api/checkout answers 503, so nobody is ever
 * charged a price that didn't come from Stripe.
 */

export type PackSource =
  | ({ source: 'stripe' } & StripePacks)
  | { source: 'fallback'; packs: readonly Pack[] };

const ttlMs = 5 * 60_000;
/** After a failed refresh, wait this long before asking Stripe again. */
const retryMs = 60_000;

const fallback: PackSource = { source: 'fallback', packs: FALLBACK_PACKS };

let lastGood: { at: number; value: PackSource & { source: 'stripe' } } | null = null;
let lastFailureAt = 0;
let inflight: Promise<PackSource> | null = null;
let warnedNoKey = false;
let client: { key: string; stripe: Stripe } | null = null;

function stripeFor(key: string): Stripe {
  if (client?.key !== key) {
    // Short timeout: the pricing page waits on this.
    client = { key, stripe: new Stripe(key, { maxNetworkRetries: 1, timeout: 8_000 }) };
  }
  return client.stripe;
}

/** Logs what helps find the call in the Stripe dashboard, never the message (it can echo part of the key). */
function describeError(err: unknown) {
  if (err instanceof Stripe.errors.StripeError) {
    return { type: err.type, code: err.code, statusCode: err.statusCode, requestId: err.requestId };
  }
  return err instanceof Error ? err.name : 'unknown error';
}

async function fetchFromStripe(key: string): Promise<PackSource> {
  const stripe = stripeFor(key);
  try {
    const pages = await Promise.all(
      chunkLookupKeys().map((lookup_keys) =>
        stripe.prices.list({ lookup_keys, active: true, expand: ['data.product'], limit: 100 }),
      ),
    );
    const result = packsFromStripePrices(pages.flatMap((page) => page.data));
    if (!result.ok) {
      console.warn('[prices] Stripe price list is invalid; using the last good prices or the fallback, card checkout off until fixed', {
        errors: result.errors,
      });
      lastFailureAt = Date.now();
      return lastGood?.value ?? fallback;
    }
    const value = { source: 'stripe' as const, ...result.value };
    lastGood = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.warn('[prices] could not read prices from Stripe; using the last good prices or the fallback', describeError(err));
    lastFailureAt = Date.now();
    return lastGood?.value ?? fallback;
  }
}

/** The packs to show and sell. Never throws. */
export async function getPacks(): Promise<PackSource> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    if (!warnedNoKey) {
      console.warn('[prices] STRIPE_SECRET_KEY is not set; showing the fallback prices from pricing.ts, card checkout off');
      warnedNoKey = true;
    }
    return fallback;
  }

  const now = Date.now();
  if (lastGood && now - lastGood.at < ttlMs) return lastGood.value;
  if (now - lastFailureAt < retryMs) return lastGood?.value ?? fallback;

  inflight ??= fetchFromStripe(key).finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Forget the cached prices, so the next getPacks() asks Stripe again (the
 * last good result is still used if that fails). Checkout calls this when
 * Stripe rejects a session, for example because a cached price was just
 * replaced.
 */
export function invalidatePacks(): void {
  if (lastGood) lastGood = { ...lastGood, at: 0 };
  lastFailureAt = 0;
}
