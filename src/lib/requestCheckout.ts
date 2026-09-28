/**
 * POSTs /api/checkout and reads the answer. Used only by the checkout dialog
 * (src/components/checkout/Checkout.tsx), so every Buy button handles the
 * response the same way:
 *
 * - `embedded`: the client secret for our custom checkout form (the site has
 *   STRIPE_PUBLISHABLE_KEY set);
 * - `redirect`: a hosted Checkout url (the fallback while it isn't);
 * - `failed`: a short, user-facing error. `cardOff` means card payment is off
 *   (503), so the email request is the way to buy.
 *
 * Relative import on purpose: vitest runs this file without the `@/` alias.
 */
import type { CheckoutDetails, CheckoutRequest } from './checkout';

export type CheckoutAnswer =
  | { kind: 'embedded'; clientSecret: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'failed'; cardOff: boolean; error: string };

export const cardOffError = "Card payment isn't available right now. Request the license by email instead.";

/** `hosted`: ask for hosted Checkout even with a publishable key (the custom form couldn't start). */
export async function requestCheckout(payload: CheckoutRequest, fetcher: typeof fetch = fetch, hosted = false): Promise<CheckoutAnswer> {
  try {
    const res = await fetcher(hosted ? '/api/checkout?mode=hosted' : '/api/checkout', {
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

export type DetailsAnswer = { ok: true } | { ok: false; error: string; field?: keyof CheckoutDetails };

/** POSTs our form's extra fields to /api/checkout/details (session metadata), right before paying. */
export async function saveCheckoutDetails(details: CheckoutDetails, fetcher: typeof fetch = fetch): Promise<DetailsAnswer> {
  try {
    const res = await fetcher('/api/checkout/details', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(details),
    });
    if (res.ok) return { ok: true };
    const data: unknown = await res.json().catch(() => null);
    const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    const error = typeof obj.error === 'string' ? obj.error : "Couldn't save your details. Try again.";
    const field = typeof obj.field === 'string' && obj.field !== 'sessionId' ? (obj.field as keyof CheckoutDetails) : undefined;
    return { ok: false, error, ...(field ? { field } : {}) };
  } catch {
    return { ok: false, error: "Couldn't reach checkout. Check your connection and try again." };
  }
}
