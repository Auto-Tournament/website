/**
 * The site's own URL and a same-origin check for state-changing POSTs.
 * No Next or Stripe import, so it is easy to test.
 */

export const DEFAULT_SITE_URL = 'https://autotournament.gg';

/** The origin from SITE_URL (default https://autotournament.gg), or null when it isn't an http(s) URL. */
export function siteUrl(raw: string | undefined = process.env.SITE_URL): string | null {
  const value = raw?.trim() || DEFAULT_SITE_URL;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * CSRF check for POSTs from our own pages: a browser request must come from
 * this site. Rejects `Sec-Fetch-Site: cross-site` / `same-site`, and an
 * Origin that is neither SITE_URL nor the host the request was sent to.
 * Requests with neither header (curl, old browsers) pass; the routes also
 * require a JSON or form body and rate-limit.
 */
export function sameOrigin(headers: Headers, site: string | null = siteUrl()): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = headers.get('origin');
  if (!origin) return true;
  if (origin === 'null') return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (site && origin === site) return true;
  const requestHost = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0].trim();
  return requestHost !== '' && host === requestHost;
}
