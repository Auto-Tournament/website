import Stripe from 'stripe';
import { readCapped } from '@/lib/readCapped';
import { issueForSession } from '@/lib/license/issue';
import { dbError } from '@/lib/db/errors';

// Stripe webhook: issues the license key when a checkout is paid. Register
// https://autotournament.gg/api/stripe/webhook in Stripe (Developers →
// Webhooks) for checkout.session.completed and
// checkout.session.async_payment_succeeded, and put its signing secret in
// STRIPE_WEBHOOK_SECRET. Unset, this route answers 404.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const maxBodyBytes = 512 * 1024;
const handled = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

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

  if (!handled.has(event.type)) return reply(200, { received: true });

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
