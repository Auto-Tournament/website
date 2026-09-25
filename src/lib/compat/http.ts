import 'server-only';
import { clientIp, createRateLimiter } from '@/lib/checkout';

/** Per-IP limit on the public reads: the page, its polling fallback and badge refreshes. */
const allowRead = createRateLimiter({ limit: 120, windowMs: 60_000 });

/** Headers every public read answers with: fresh on every request, readable from any origin. */
export const readHeaders = { 'cache-control': 'no-cache', 'access-control-allow-origin': '*' } as const;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

/** A 429 when this address has read too much this minute, else null. */
export function limitRead(request: Request): Response | null {
  if (allowRead(clientIp(request.headers), Date.now())) return null;
  return json(429, { success: false, error: 'Too many compatibility requests, try again in a minute' }, { 'retry-after': '60' });
}

export function readFailed(what: string, err: unknown): Response {
  console.error(`[compat] could not ${what}`, err instanceof Error ? err.message : 'unknown error');
  return json(500, { success: false, error: 'Could not read compatibility' });
}
