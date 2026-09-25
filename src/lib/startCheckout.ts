'use client';

/**
 * Client-side helper that POSTs /api/checkout and redirects to the returned
 * Stripe Checkout url. Shared by the pack cards, the founder strip and the
 * calculator so all three handle the response the same way.
 */
import type { CheckoutRequest } from '@/lib/checkout';

export type StartCheckoutResult =
  | { ok: true }
  | { ok: false; cardOff: boolean; error: string };

/**
 * Starts checkout for `payload`. On success it navigates the browser to
 * Stripe and never resolves (the caller should keep its loading state on).
 * On failure it resolves with a short, user-facing error message.
 */
export async function startCheckout(payload: CheckoutRequest): Promise<StartCheckoutResult> {
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data: unknown = await res.json().catch(() => null);
    const field = (key: string) =>
      typeof data === 'object' && data !== null && typeof (data as Record<string, unknown>)[key] === 'string'
        ? ((data as Record<string, unknown>)[key] as string)
        : undefined;
    const url = field('url');
    if (res.ok && url && url.startsWith('https://')) {
      // Leave the caller in its loading state while the browser navigates.
      window.location.assign(url);
      return { ok: true };
    }
    if (res.status === 503) {
      return { ok: false, cardOff: true, error: "Card payment isn't available right now. Request the license by email instead." };
    }
    if (res.status === 400 || res.status === 413 || res.status === 429) {
      return { ok: false, cardOff: false, error: field('error') ?? 'Something went wrong. Request the license by email instead.' };
    }
    return { ok: false, cardOff: false, error: "Couldn't start checkout. Try again, or request the license by email." };
  } catch {
    return { ok: false, cardOff: false, error: "Couldn't reach checkout. Try again, or request the license by email." };
  }
}
