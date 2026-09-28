import Stripe from 'stripe';
import { readCapped } from '@/lib/readCapped';
import { issueForSession, stripeServer } from '@/lib/license/issue';
import { syncChargeRefund, syncRefundFailure, type SyncResult } from '@/lib/license/refund';
import { db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';

// Stripe webhook. Register https://autotournament.gg/api/stripe/webhook in
// Stripe (Developers → Webhooks) and put its signing secret in
// STRIPE_WEBHOOK_SECRET. Unset, this route answers 404. Events:
// - checkout.session.completed, checkout.session.async_payment_succeeded:
//   issue the license key.
// - charge.refunded: a refund (from the admin CRM or the Stripe Dashboard);
//   full marks the license refunded, partial records the amount.
// - refund.updated, refund.failed: a refund that failed or was canceled.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const maxBodyBytes = 512 * 1024;
const issuing = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

/**
 * The Checkout Session a PaymentIntent paid, for licenses issued before the
 * PaymentIntent was stored (needs Checkout Sessions: Read on the key). Throws
 * when Stripe can't be asked, so the webhook answers 500 and Stripe retries.
 */
async function sessionForPaymentIntent(paymentIntent: string): Promise<string | null> {
  const stripe = stripeServer();
  if (!stripe) return null;
  const { data } = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 1 });
  return data[0]?.id ?? null;
}

async function refundEvent(event: Stripe.Event): Promise<Response> {
  let result: SyncResult;
  try {
    if (event.type === 'charge.refunded') {
      result = await syncChargeRefund(db(), event.data.object as Stripe.Charge, sessionForPaymentIntent);
    } else {
      result = await syncRefundFailure(db(), event.data.object as Stripe.Refund, sessionForPaymentIntent);
    }
  } catch (err) {
    const info = err instanceof Stripe.errors.StripeError ? { type: err.type, code: err.code, requestId: err.requestId } : dbError(err);
    console.error('[refund] webhook sync failed; Stripe will retry', { event: event.id, type: event.type }, info);
    return reply(500, { error: 'Could not record the refund' });
  }
  if (result.status !== 'unknown') console.info('[refund] webhook', { event: event.id, type: event.type, id: result.licenseId, status: result.status });
  return reply(200, { received: true, refund: result.status });
}

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return reply(404, { error: 'Not found' });

  const signature = request.headers.get('stripe-signature');
  if (!signature) return reply(400, { error: 'Missing signature' });

  let raw: string | null;
  try {
    raw = await readCapped(request, maxBodyBytes);
  } catch {
    return reply(400, { error: 'Could not read the request' });
  }
  if (raw === null) return reply(413, { error: 'Too large' });

  let event: Stripe.Event;
  try {
    // Checks the signature against the raw body, and that it is at most 5 minutes old.
    event = Stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return reply(400, { error: 'Bad signature' });
  }

  if (event.type === 'charge.refunded' || event.type === 'refund.updated' || event.type === 'refund.failed') return refundEvent(event);
  if (!issuing.has(event.type)) return reply(200, { received: true });

  const session = event.data.object as Stripe.Checkout.Session;
  try {
    const result = await issueForSession(session);
    // Not configured yet: 503, so Stripe retries (for up to 3 days) and the key is issued once it is.
    if (result.status === 'disabled') {
      console.error('[license] a license was paid but LICENSE_SIGNING_KEY is not set; Stripe will retry', { session: session.id });
      return reply(503, { error: 'License signing is not configured' });
    }
    return reply(200, { received: true, license: result.status });
  } catch (err) {
    console.error('[license] issuing failed; Stripe will retry', { session: session.id }, dbError(err));
    return reply(500, { error: 'Could not issue the license' });
  }
}
