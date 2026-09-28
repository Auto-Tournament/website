/**
 * The Stripe publishable key (pk_live_… / pk_test_…) for Embedded Checkout.
 * Public by design, but read at runtime from STRIPE_PUBLISHABLE_KEY on the
 * server and handed to the page as a prop: the Docker image is built without
 * the .env, so a NEXT_PUBLIC_ variable would be empty.
 *
 * Null (hosted Checkout, as before) when it is unset, not a publishable key,
 * or in the other mode than STRIPE_SECRET_KEY: a test key with a live secret
 * key (or the other way round) can't open the live session.
 *
 * Relative import on purpose: vitest runs this file without the `@/` alias.
 */
import { stripeLivemode } from './stripeMode';

const publishable = /^pk_(live|test)_[A-Za-z0-9]+$/;

let warned = false;
function warnOnce(reason: string) {
  if (warned) return;
  warned = true;
  // Never the key itself.
  console.warn(`[checkout] STRIPE_PUBLISHABLE_KEY ${reason}; using hosted Checkout`);
}

export function stripePublishableKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key) return null;
  if (!publishable.test(key)) {
    warnOnce('is not a publishable key (pk_live_… or pk_test_…)');
    return null;
  }
  const secret = env.STRIPE_SECRET_KEY?.trim();
  if (secret && key.startsWith('pk_live_') !== stripeLivemode(secret)) {
    warnOnce('is in the other mode (live/test) than STRIPE_SECRET_KEY');
    return null;
  }
  return key;
}
