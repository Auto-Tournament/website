import { cookies } from 'next/headers';
import { sameOrigin } from '@/lib/site';
import { accountStore } from '@/lib/account/service';
import { accountSecret, clearedSessionCookie, SESSION_COOKIE, verifySession } from '@/lib/account/session';

// Signs out of /account: ends the session on the server and clears the cookie.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return new Response('Forbidden', { status: 403 });
  const secret = accountSecret();
  const sessionId = secret ? verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret) : null;
  if (sessionId) {
    await accountStore()
      .deleteSession(sessionId)
      .catch((err) => console.error('[account] sign-out failed', err instanceof Error ? err.message : 'unknown error'));
  }
  return new Response(null, { status: 303, headers: { location: '/account', 'cache-control': 'no-store', 'set-cookie': clearedSessionCookie() } });
}
