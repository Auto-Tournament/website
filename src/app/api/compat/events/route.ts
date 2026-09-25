import { clientIp, createRateLimiter } from '@/lib/checkout';
import { compatIngestToken, isValidCompatIngestAuth } from '@/lib/compat/config';
import { COMPAT_MAX_BYTES, validateCompatDocument } from '@/lib/compat/document';
import { json } from '@/lib/compat/http';
import { ingestCompat } from '@/lib/compat/service';
import { readCapped } from '@/lib/readCapped';

// Ready Up's CI posts one compat.json (schema 1) per run update here, with
// `Authorization: Bearer <COMPAT_INGEST_TOKEN>` (ready-up: docs/CS2-COMPAT.md,
// repo variable COMPAT_INGEST_URL). Upserted by `run.id`: a copy with an
// older `checked_at` than the stored one is ignored (`stale`), an identical
// one changes nothing (`unchanged`). Every stored change goes to the open
// streams. Validated strictly (unknown fields are refused), at most 256 KB.
// 404 while COMPAT_INGEST_TOKEN is unset.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Per-IP limit, ahead of the token check, so guessing it is slow too. */
const allow = createRateLimiter({ limit: 60, windowMs: 60_000 });

export async function POST(request: Request) {
  if (!compatIngestToken()) return json(404, { success: false, error: 'not_found' });

  if (!allow(clientIp(request.headers), Date.now())) {
    return json(429, { success: false, error: 'Too many compatibility reports, try again in a minute' }, { 'retry-after': '60' });
  }

  if (!isValidCompatIngestAuth(request.headers.get('authorization'))) {
    return json(401, { success: false, error: 'invalid_token' }, { 'www-authenticate': 'Bearer' });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json(415, { success: false, error: 'Expected a JSON body (Content-Type: application/json).' });
  }

  let raw: string | null;
  try {
    raw = await readCapped(request, COMPAT_MAX_BYTES);
  } catch {
    return json(400, { success: false, error: 'Could not read the request.' });
  }
  if (raw === null) return json(413, { success: false, error: `Body larger than ${COMPAT_MAX_BYTES} bytes.` });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { success: false, error: 'Invalid JSON.' });
  }

  const checked = validateCompatDocument(body);
  if (!checked.ok) return json(400, { success: false, error: 'invalid_document', details: checked.errors });

  try {
    const result = await ingestCompat(checked.value, 'push');
    return json(200, { success: true, ...result });
  } catch (err) {
    console.error('[compat] could not store a pushed run', err instanceof Error ? err.message : 'unknown error');
    return json(500, { success: false, error: 'Could not store the run' });
  }
}
