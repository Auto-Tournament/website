import type { NextRequest } from 'next/server';
import { consoleEnabled, handlers } from '@/lib/console/auth';

// Auth.js: the OAuth and email-link callbacks, the session and CSRF endpoints.
// Starting a sign-in or signing out goes through the console's Server Actions
// (src/app/console/actions.ts), which check the origin and rate-limit, so the
// POST forms here are closed; only the callbacks take POSTs. src/proxy.ts
// serves this route on the console's host only. 404 while the console is off.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

export async function GET(request: NextRequest) {
  if (!consoleEnabled()) return notFound();
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!consoleEnabled()) return notFound();
  const action = request.nextUrl.pathname.split('/api/auth/')[1] ?? '';
  if (!action.startsWith('callback/')) return notFound();
  if (Number(request.headers.get('content-length') ?? 0) > 16 * 1024) return new Response('Too large', { status: 413 });
  return handlers.POST(request);
}
