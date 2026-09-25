import Stripe from 'stripe';
import {
  clientIp,
  createRateLimiter,
  describeLicense,
  licenseMetadata,
  maxBodyBytes,
  pickPrice,
  stripeProductNames,
  validateCheckoutRequest,
} from '@/lib/checkout';

// Starts a Stripe Checkout Session for a commercial license. Server only: the
// secret key comes from STRIPE_SECRET_KEY at runtime and never reaches the
// client. Without it the route answers 503 and the calculator falls back to
// the email request.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const defaultSiteUrl = 'https://autotournament.gg';
const priceCacheMs = 10 * 60 * 1000;

const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });

let stripeClient: { key: string; client: Stripe } | null = null;
let priceCache: { at: number; prices: Stripe.Price[] } | null = null;

function reply(status: number, body: Record<string, string>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function stripeFor(key: string): Stripe {
  if (stripeClient?.key !== key) {
    stripeClient = { key, client: new Stripe(key, { maxNetworkRetries: 1, timeout: 20_000 }) };
  }
  return stripeClient.client;
}

async function activePrices(stripe: Stripe): Promise<Stripe.Price[]> {
  if (priceCache && Date.now() - priceCache.at < priceCacheMs) return priceCache.prices;
  const prices = await stripe.prices.list({ active: true, expand: ['data.product'], limit: 100 }).autoPagingToArray({ limit: 1000 });
  priceCache = { at: Date.now(), prices };
  return prices;
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

  const checked = validateCheckoutRequest(body);
  if (!checked.ok) return reply(400, { error: checked.error });
  const order = checked.value;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return reply(503, { error: "Card payment isn't available right now. Request the license by email instead." });
  }

  let coupon: string | undefined;
  if (order.community) {
    coupon = process.env.STRIPE_COMMUNITY_COUPON?.trim();
    if (!coupon) return reply(400, { error: 'Community discount needs a quick check first: email us' });
  }

  const base = siteUrl();
  if (!base) {
    console.error('[checkout] SITE_URL is not a valid http(s) URL');
    return reply(500, { error: 'Checkout is not set up correctly. Request the license by email instead.' });
  }

  const stripe = stripeFor(secretKey);

  let prices: Stripe.Price[];
  try {
    prices = await activePrices(stripe);
  } catch (err) {
    logStripeError('listing prices', err);
    return reply(502, { error: "Couldn't reach the payment provider. Try again, or request the license by email." });
  }

  const price = pickPrice(prices, order.option, order.period);
  if (!price) {
    // Product name only: enough to find it in the dashboard.
    console.error('[checkout] no matching active price for product', stripeProductNames[order.option][order.period]);
    priceCache = null;
    return reply(500, { error: 'Checkout is not set up correctly. Request the license by email instead.' });
  }

  const description = describeLicense(order);
  const metadata = licenseMetadata(order);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price.id, quantity: order.seats }],
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      customer_creation: 'always',
      name_collection: { business: { enabled: true, optional: false } },
      custom_fields: [
        {
          // Stripe keys must be alphanumeric, so no underscores.
          key: 'eventdates',
          label: { type: 'custom', custom: 'Event date(s) or yearly start date' },
          type: 'text',
          optional: false,
        },
        {
          key: 'eventname',
          label: { type: 'custom', custom: 'Event name and website' },
          type: 'text',
          optional: true,
        },
      ],
      metadata,
      payment_intent_data: { description, metadata },
      invoice_creation: { enabled: true, invoice_data: { description, metadata } },
      // Stripe rejects promotion codes and a preset discount together.
      ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
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
    return reply(502, { error: "Couldn't start checkout. Try again, or request the license by email." });
  }
}
