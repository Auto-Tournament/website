import { after } from 'next/server';
import { clientIp, createRateLimiter } from '@/lib/checkout';
import { readCapped } from '@/lib/readCapped';
import { sameOrigin } from '@/lib/site';
import { emailHash } from '@/lib/license/format';
import { accountEnabled, sendSignInLink } from '@/lib/account/service';

// /account sign-in: POST { email }. Emails a single-use sign-in link (15
// minutes) when at least one license was bought with that email. The answer
// is the same either way, and the email goes out after the response, so
// neither tells whether the address has a license. 404 when /account is off.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowIp = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
/** Per email hash; over it, nothing is sent but the answer is the same. */
const allowEmail = createRateLimiter({ limit: 3, windowMs: 60 * 60_000 });

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!accountEnabled()) return reply(404, { error: 'Not found.' });
  if (!sameOrigin(request.headers)) return reply(403, { error: 'Forbidden.' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(400, { error: 'Expected a JSON body.' });
  if (!allowIp(clientIp(request.headers), Date.now())) return reply(429, { error: 'Too many tries. Wait 10 minutes.' });

  let body: unknown;
  try {
    const raw = await readCapped(request, 1024);
    if (raw === null) return reply(413, { error: 'Request too large.' });
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'Invalid request.' });
  }
  const email = (typeof body === 'object' && body !== null ? (body as Record<string, unknown>).email : undefined) as unknown;
  if (typeof email !== 'string' || !/^[^\s@]{1,200}@[^\s@]{1,200}$/.test(email.trim())) return reply(400, { error: 'Enter the email you paid with.' });

  const mail = email.trim();
  const hash = emailHash(mail);
  if (allowEmail(hash, Date.now())) after(() => sendSignInLink(mail, hash));
  return reply(200, { message: "If there's a license for that email, we've sent a sign-in link. It works once, for 15 minutes." });
}
