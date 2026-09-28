import { clientIp, createRateLimiter } from '@/lib/checkout';
import { readCapped } from '@/lib/readCapped';
import { emailHash } from '@/lib/license/format';
import { licenseStore } from '@/lib/license/store';

// Gets an issued license key again: POST { reference, email }, where
// reference is the order reference (Checkout Session id, cs_…) shown on the
// thanks page, or the invoice number on Stripe's receipt. Both must match.
// The same answer for "no such order" and "wrong email".
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

const notFound = () => reply(404, { error: 'No license matches that order reference and email.' });

export async function POST(request: Request) {
  if (!allow(clientIp(request.headers), Date.now())) {
    return reply(429, { error: 'Too many tries. Wait 10 minutes, or email us.' });
  }
  let body: unknown;
  try {
    const raw = await readCapped(request, 1024);
    if (raw === null) return reply(413, { error: 'Request too large.' });
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }
  const { reference, email } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof reference !== 'string' || typeof email !== 'string') return reply(400, { error: 'Enter the order reference and the email.' });
  const ref = reference.trim();
  const mail = email.trim();
  if (!/^[A-Za-z0-9_-]{4,260}$/.test(ref) || !/^[^\s@]{1,200}@[^\s@]{1,200}$/.test(mail)) return notFound();

  try {
    const record = await licenseStore().find(ref, emailHash(mail));
    if (!record) return notFound();
    return reply(200, { token: record.token, license: record.payload });
  } catch (err) {
    console.error('[license] retrieve failed', err instanceof Error ? err.message : 'unknown error');
    return reply(500, { error: 'Could not look up the license. Try again, or email us.' });
  }
}
