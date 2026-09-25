import Stripe from 'stripe';
import {
  checkoutFormParams,
  clientIp,
  createRateLimiter,
  describeLicense,
  licenseMetadata,
  maxBodyBytes,
  validateCheckoutRequest,
} from '@/lib/checkout';
import { packIn } from '@/components/pricing';
import { lookupKey } from '@/lib/stripePacks';
import { getPacks, invalidatePacks } from '@/lib/stripePrices';

// Starts a Stripe Checkout Session for a commercial license pack. Server only: the
// secret key comes from STRIPE_SECRET_KEY at runtime and never reaches the
// client. Without it, or while the prices come from the pricing.ts fallback
// instead of Stripe, the route answers 503 and the calculator falls back to
// the email request.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const defaultSiteUrl = 'https://autotournament.gg';

// Seller details a Norwegian invoice needs (org number), and why no VAT is shown.
const invoiceFooter =
  'Gullberg Hansen Consulting (ENK) · Org. nr. 938 566 674 · Fredengvegen 15, 2817 Gjøvik, Norway · sivert@autotournament.gg\n' +
  'No VAT added (seller not VAT-registered). Licenses are governed by the Commercial License Terms at https://autotournament.gg/terms';

const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });

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

/** Logs what helps find the call in the Stripe dashboard, never the message (it can echo part of the key). */
function logStripeError(step: string, err: unknown) {
  if (err instanceof Stripe.errors.StripeError) {
    console.error(`[checkout] ${step} failed`, {
      type: err.type,
      code: err.code,
      param: err.param,
      statusCode: err.statusCode,
      requestId: err.requestId,
    });
  } else {
    console.error(`[checkout] ${step} failed`, err instanceof Error ? err.name : 'unknown error');
  }
}

/** Reads at most `limit` bytes; null when the body is larger. */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function siteUrl(): string | null {
  const raw = process.env.SITE_URL?.trim() || defaultSiteUrl;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!allow(clientIp(request.headers), Date.now())) {
    return reply(429, { error: 'Too many checkout attempts. Try again in a minute.' });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
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

  // Packs and server limits from Stripe (cached), so the pack derived from the
  // servers uses Stripe's limits.
  const prices = await getPacks();

  const checked = validateCheckoutRequest(body, prices.packs);
  if (!checked.ok) return reply(400, { error: checked.error });
  const order = checked.value;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey || prices.source !== 'stripe') {
    // Never charge a price that didn't come from Stripe.
    return reply(503, { error: "Card payment isn't available right now. Request the license by email instead." });
  }

  const priceKey = lookupKey(order.pack, order.period);
  const priceId = prices.priceIds[priceKey];
  if (!priceId) {
    console.error('[checkout] no Stripe price for lookup key', { lookupKey: priceKey });
    return reply(503, { error: "Card payment isn't available right now. Request the license by email instead." });
  }
  const pack = packIn(prices.packs, order.pack);

  const base = siteUrl();
  if (!base) {
    console.error('[checkout] SITE_URL is not a valid http(s) URL');
    return reply(500, { error: 'Checkout is not set up correctly. Request the license by email instead.' });
  }

  const stripe = stripeFor(secretKey);

  const description = describeLicense(pack, order.period);
  // Founder orders carry founder=true. The first-25 / 31 March 2027 limit is not
  // enforced in code: the owner checks it by hand before sending the license.
  const metadata = licenseMetadata(order);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // The Stripe price found by its lookup key (<pack>_<period>). The amount
      // is Stripe's and never comes from the client.
      line_items: [{ price: priceId, quantity: 1 }],
      customer_creation: 'always',
      // Business name, B2B confirmation, event details and the terms checkbox.
      ...checkoutFormParams(base),
      metadata,
      payment_intent_data: { description, metadata },
      invoice_creation: { enabled: true, invoice_data: { description, metadata, footer: invoiceFooter } },
      allow_promotion_codes: true,
      success_url: `${base}/pricing/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/pricing#calculator`,
    });
    if (!session.url) {
      console.error('[checkout] session created without a url', { id: session.id });
      return reply(502, { error: "Couldn't start checkout. Try again, or request the license by email." });
    }
    return reply(200, { url: session.url });
  } catch (err) {
    logStripeError('creating the session', err);
    // A cached price may have just been replaced (seed script re-run): read
    // the prices again on the next attempt.
    if (err instanceof Stripe.errors.StripeInvalidRequestError) invalidatePacks();
    return reply(502, { error: "Couldn't start checkout. Try again, or request the license by email." });
  }
}
