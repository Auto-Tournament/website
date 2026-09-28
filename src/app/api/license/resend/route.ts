import { dbError } from '@/lib/db/errors';
import { after } from 'next/server';
import { clientIp, createRateLimiter } from '@/lib/checkout';
import { emailConfig } from '@/lib/email/postmark';
import { readCapped } from '@/lib/readCapped';
import { sameOrigin } from '@/lib/site';
import { emailLicense } from '@/lib/license/deliver';
import { emailHash } from '@/lib/license/format';
import { licenseStore } from '@/lib/license/store';

// "Email it to me again" on /license: POST { reference, email }. When the
// order reference (or invoice number) and the email's hash match a license,
// its key is emailed to that address (the one typed, never another). The
// answer is the same whether or not anything matched, and the email is sent
// after the response, so the timing doesn't tell either. Off (503) without
// POSTMARK_SERVER_TOKEN.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowIp = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
const allowLicense = createRateLimiter({ limit: 3, windowMs: 60 * 60_000 });

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

const done = () => reply(200, { message: "If that matches a license, we've emailed the key to that address. It can take a few minutes." });

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return reply(403, { error: 'Forbidden.' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(400, { error: 'Expected a JSON body.' });
  if (!emailConfig()) return reply(503, { error: "Email isn't available right now. Use the key shown above, or email us." });
  if (!allowIp(clientIp(request.headers), Date.now())) return reply(429, { error: 'Too many tries. Wait 10 minutes, or email us.' });

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
  if (!/^[A-Za-z0-9_-]{4,260}$/.test(ref) || !/^[^\s@]{1,200}@[^\s@]{1,200}$/.test(mail)) return done();

  try {
    const record = await licenseStore().find(ref, emailHash(mail));
    if (record && allowLicense(record.session_id, Date.now())) {
      after(() => emailLicense(record.session_id, mail, { again: true }));
    }
  } catch (err) {
    console.error('[license] resend lookup failed', dbError(err));
    return reply(500, { error: 'Something went wrong. Try again, or email us.' });
  }
  return done();
}
