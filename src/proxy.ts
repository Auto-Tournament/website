import { NextResponse, type NextRequest } from 'next/server';
import { routeRequest } from '@/lib/console/urls';

// Host-based routing for the console (src/lib/console/urls.ts):
// console.autotournament.gg serves the routes under src/app/console, and the
// main site's /account now points there. Console responses get strict
// headers: never framed, never indexed, no referrer beyond the origin.

const consoleHeaders: [string, string][] = [
  ['x-robots-tag', 'noindex, nofollow'],
  ['x-frame-options', 'DENY'],
  ['content-security-policy', "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com"],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['x-content-type-options', 'nosniff'],
  ['permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
];

function withConsoleHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of consoleHeaders) res.headers.set(k, v);
  return res;
}

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname, search } = request.nextUrl;
  const decision = routeRequest(host, pathname, search);
  switch (decision.kind) {
    case 'robots':
      return new NextResponse('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
    case 'not-found':
      return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    case 'redirect':
      return NextResponse.redirect(new URL(decision.location, request.url), 308);
    case 'rewrite':
      return withConsoleHeaders(NextResponse.rewrite(new URL(decision.path, request.url)));
    case 'next':
      return decision.console ? withConsoleHeaders(NextResponse.next()) : NextResponse.next();
  }
}

export const config = {
  // Everything but Next's static chunks and image optimizer.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
