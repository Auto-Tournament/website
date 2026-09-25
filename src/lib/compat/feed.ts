import { readCapped } from '@/lib/readCapped';
import { COMPAT_MAX_BYTES, validateCompatDocument, type CompatDocument } from './document';

/**
 * Reads a published compat.json (by default Ready Up's, on its `cs2-build`
 * branch). The fallback for when no push has arrived: right after this site
 * is deployed, or while the CI can't reach it.
 *
 * Ported from the platform's compatFeedService.ts. Bounded in time and size;
 * a fetch that fails, times out, is too large or does not validate returns
 * an error and changes nothing, so the last good run stays.
 */

export const COMPAT_FEED_TIMEOUT_MS = 10_000;

export type CompatFeedFetch =
  | { status: 'ok'; document: CompatDocument; etag: string | null }
  | { status: 'not_modified' }
  | { status: 'error'; error: string };

/** Fetch and validate one copy of the feed. Never throws. */
export async function fetchCompatFeed(
  url: string,
  options: { etag?: string | null; timeoutMs?: number } = {},
): Promise<CompatFeedFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? COMPAT_FEED_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'autotournament.gg-compat',
        ...(options.etag ? { 'If-None-Match': options.etag } : {}),
      },
      redirect: 'follow',
      // Our own cache (lib/compat/service.ts) decides when to ask again.
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 304) return { status: 'not_modified' };
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { status: 'error', error: `HTTP ${response.status}` };
    }

    const text = await readCapped(response, COMPAT_MAX_BYTES);
    if (text === null) return { status: 'error', error: `it is larger than ${COMPAT_MAX_BYTES} bytes` };
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { status: 'error', error: 'the response is not JSON' };
    }
    const checked = validateCompatDocument(body);
    if (!checked.ok) {
      return { status: 'error', error: `the document is invalid: ${checked.errors.slice(0, 5).join('; ')}` };
    }
    return { status: 'ok', document: checked.value, etag: response.headers.get('etag') };
  } catch (error) {
    if (controller.signal.aborted) return { status: 'error', error: 'it did not answer in time' };
    const err = error as { name?: string; message?: string };
    if (err?.name === 'TypeError' && /decode/i.test(err.message ?? '')) {
      return { status: 'error', error: 'the response is not UTF-8' };
    }
    return { status: 'error', error: err?.message ?? String(error) };
  } finally {
    clearTimeout(timer);
  }
}
