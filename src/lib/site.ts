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
 * this site. When the browser sends `Sec-Fetch-Site` (all current ones do),
 * that decides: only `same-origin` (or `none`, typed by the user) passes.
 * Otherwise the Origin must be SITE_URL or the host the request was sent to.
 * Requests with neither header (curl) pass; the routes also rate-limit.
 */
export function sameOrigin(headers: Headers, site: string | null = siteUrl()): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none';
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
