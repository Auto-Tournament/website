import Stripe from 'stripe';
import {
  checkoutDetailsMetadata,
  clientIp,
  createRateLimiter,
  maxBodyBytes,
  sessionTakesDetails,
  validateCheckoutDetails,
} from '@/lib/checkout';
import { readCapped } from '@/lib/readCapped';

// The fields our custom checkout form collects that Stripe's elements mode
// can't (company, event or client, event dates, VAT ID, the business
// confirmation and the terms acceptance). The form calls this through
// checkout.runServerUpdate() right before checkout.confirm(); it writes them
// to the Checkout Session's metadata, the only thing a session update can
// change besides line items and shipping.
//
// Only an open, custom-mode session that /api/checkout created (metadata.pack
// is a pack id) takes details, and only our own keys are written: Stripe
// merges metadata by key, so pack, period, max_servers and founder stay as the
// server set them. Prices, line items and the amount are never touched.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createRateLimiter({ limit: 20, windowMs: 60_000 });

let stripeClient: { key: string; client: Stripe } | null = null;

function reply(status: number, body: Record<string, string>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function stripeFor(key: string): Stripe {
  if (stripeClient?.key !== key) {
    stripeClient = { key, client: new Stripe(key, { maxNetworkRetries: 1, timeout: 20_000 }) };
  }
  return stripeClient.client;
}

function logStripeError(step: string, err: unknown) {
  if (err instanceof Stripe.errors.StripeError) {
    console.error(`[checkout/details] ${step} failed`, { type: err.type, code: err.code, statusCode: err.statusCode, requestId: err.requestId });
  } else {
    console.error(`[checkout/details] ${step} failed`, err instanceof Error ? err.name : 'unknown error');
  }
}

export async function POST(request: Request) {
  if (!allow(clientIp(request.headers), Date.now())) {
    return reply(429, { error: 'Too many attempts. Try again in a minute.' });
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return reply(400, { error: 'Expected a JSON body.' });
  }
  let raw: string | null;
  try {
    raw = await readCapped(request, maxBodyBytes);
  } catch {
    return reply(400, { error: 'Could not read the request.' });
  }
  if (raw === null) return reply(413, { error: 'Request too large.' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'Invalid JSON.' });
  }

  const checked = validateCheckoutDetails(body);
  if (!checked.ok) return reply(400, { error: checked.error, ...(checked.field ? { field: checked.field } : {}) });
  const details = checked.value;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return reply(503, { error: "Card payment isn't available right now. Request the license by email instead." });
  const stripe = stripeFor(secretKey);

  try {
    const session = await stripe.checkout.sessions.retrieve(details.sessionId);
    if (!sessionTakesDetails(session)) return reply(409, { error: 'This checkout has ended. Close it and start again.' });
    await stripe.checkout.sessions.update(details.sessionId, { metadata: checkoutDetailsMetadata(details, new Date()) });
    return reply(200, { ok: 'saved' });
  } catch (err) {
    logStripeError('saving the details', err);
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.statusCode === 404) {
      return reply(409, { error: 'This checkout has ended. Close it and start again.' });
    }
    return reply(502, { error: "Couldn't save your details. Try again." });
  }
}
