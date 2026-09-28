import { clientIp, createRateLimiter } from '@/lib/checkout';
import { readCapped } from '@/lib/readCapped';
import { sameOrigin } from '@/lib/site';
import { accountEnabled, accountStore } from '@/lib/account/service';
import { accountSecret, sessionCookie, signSession } from '@/lib/account/session';

// Uses up a sign-in link: POST token=… (the button on /account/signin, so a
// mail scanner that opens the link doesn't burn it). Sets the session cookie
// and sends the buyer to /account. 404 when /account is off.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

const redirect = (location: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}) } });

export async function POST(request: Request) {
  const secret = accountSecret();
  if (!secret || !accountEnabled()) return new Response('Not found', { status: 404 });
  if (!sameOrigin(request.headers)) return new Response('Forbidden', { status: 403 });
  if (!allow(clientIp(request.headers), Date.now())) return redirect('/account?signin=busy');

  let token: string | null = null;
  try {
    const raw = await readCapped(request, 1024);
    if (raw !== null) token = new URLSearchParams(raw).get('token');
  } catch {
    token = null;
  }
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return redirect('/account?signin=invalid');

  try {
    const result = await accountStore().signIn(token);
    if (!result) return redirect('/account?signin=invalid');
    return redirect('/account', sessionCookie(signSession(result.sessionId, secret)));
  } catch (err) {
    console.error('[account] sign-in failed', err instanceof Error ? err.message : 'unknown error');
    return redirect('/account?signin=error');
  }
}
