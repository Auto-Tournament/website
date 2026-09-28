/**
 * POSTs /api/checkout and reads the answer. Used only by the checkout dialog
 * (src/components/checkout/Checkout.tsx), so every Buy button handles the
 * response the same way:
 *
 * - `embedded`: the client secret for Stripe Embedded Checkout (the site has
 *   STRIPE_PUBLISHABLE_KEY set);
 * - `redirect`: a hosted Checkout url (the fallback while it isn't);
 * - `failed`: a short, user-facing error. `cardOff` means card payment is off
 *   (503), so the email request is the way to buy.
 *
 * Relative import on purpose: vitest runs this file without the `@/` alias.
 */
import type { CheckoutRequest } from './checkout';

export type CheckoutAnswer =
  | { kind: 'embedded'; clientSecret: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'failed'; cardOff: boolean; error: string };

export const cardOffError = "Card payment isn't available right now. Request the license by email instead.";

export async function requestCheckout(payload: CheckoutRequest, fetcher: typeof fetch = fetch): Promise<CheckoutAnswer> {
  try {
    const res = await fetcher('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data: unknown = await res.json().catch(() => null);
    const field = (key: string) =>
      typeof data === 'object' && data !== null && typeof (data as Record<string, unknown>)[key] === 'string'
        ? ((data as Record<string, unknown>)[key] as string)
        : undefined;
    if (res.ok) {
      const clientSecret = field('clientSecret');
      if (clientSecret && clientSecret.startsWith('cs_')) return { kind: 'embedded', clientSecret };
      const url = field('url');
      if (url && url.startsWith('https://')) return { kind: 'redirect', url };
    }
    if (res.status === 503) return { kind: 'failed', cardOff: true, error: cardOffError };
    if (res.status === 400 || res.status === 409 || res.status === 413 || res.status === 429) {
      return { kind: 'failed', cardOff: false, error: field('error') ?? 'Something went wrong. Request the license by email instead.' };
    }
    return { kind: 'failed', cardOff: false, error: "Couldn't start checkout. Try again, or request the license by email." };
  } catch {
    return { kind: 'failed', cardOff: false, error: "Couldn't reach checkout. Try again, or request the license by email." };
  }
}
