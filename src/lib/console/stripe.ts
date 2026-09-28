import 'server-only';
import Stripe from 'stripe';
import { stripeServer } from '@/lib/license/issue';

export { stripeLivemode } from '@/lib/stripeMode';

export type PortalResult = { ok: true; url: string } | { ok: false; reason: 'no-customer' | 'not-available' | 'error' };

/**
 * A Stripe Billing customer portal session for the organization's customer:
 * invoices, receipts and payment details. The site's restricted key needs
 * "Customer portal: Write"; without it (or before the portal is set up in the
 * Dashboard), Stripe refuses and this says 'not-available'.
 */
export async function billingPortal(customer: string | null, returnUrl: string): Promise<PortalResult> {
  if (!customer) return { ok: false, reason: 'no-customer' };
  const stripe = stripeServer();
  if (!stripe) return { ok: false, reason: 'not-available' };
  try {
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
    return { ok: true, url: session.url };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      // Never the message: it can echo part of the key.
      console.warn('[console] billing portal unavailable', { type: err.type, code: err.code, statusCode: err.statusCode, requestId: err.requestId });
      if (err instanceof Stripe.errors.StripePermissionError || err.statusCode === 403 || err instanceof Stripe.errors.StripeInvalidRequestError) {
        return { ok: false, reason: 'not-available' };
      }
      return { ok: false, reason: 'error' };
    }
    console.error('[console] billing portal failed', err instanceof Error ? err.name : 'unknown error');
    return { ok: false, reason: 'error' };
  }
}
