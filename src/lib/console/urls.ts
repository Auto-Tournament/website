/**
 * Where the console lives. In production it has its own host,
 * https://console.autotournament.gg (AUTH_URL), and src/proxy.ts maps that host
 * onto the routes under src/app/console. When AUTH_URL is a localhost URL
 * (development), the console is served at /console on the same host instead.
 *
 * Pure (env passed in, defaults to process.env), no Next import, so it runs in
 * the proxy, on the server and in tests.
 */

export const DEFAULT_CONSOLE_URL = 'https://console.autotournament.gg';
/** The path the console's routes live under (src/app/console). */
export const CONSOLE_PREFIX = '/console';

type Env = Record<string, string | undefined>;

/** The console's origin: AUTH_URL's, or https://console.autotournament.gg. */
export function consoleOrigin(env: Env = process.env): string {
  const raw = env.AUTH_URL?.trim() || DEFAULT_CONSOLE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
  } catch {
    // fall through
  }
  return DEFAULT_CONSOLE_URL;
}

export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
}

/** True when the console has a host of its own (production); false in development, where it is /console. */
export function consoleOnOwnHost(env: Env = process.env): boolean {
  return !isLocalHostname(new URL(consoleOrigin(env)).hostname);
}

/** The console's host (with port, as in a Host header), when it has its own; otherwise null. */
export function consoleHost(env: Env = process.env): string | null {
  return consoleOnOwnHost(env) ? new URL(consoleOrigin(env)).host.toLowerCase() : null;
}

/** '' on the console's own host, '/console' in development. */
export function consoleBase(env: Env = process.env): string {
  return consoleOnOwnHost(env) ? '' : CONSOLE_PREFIX;
}

/** A console path as a link on the console's pages: consoleHref('/members') → '/members' (or '/console/members'). */
export function consoleHref(path: string, env: Env = process.env): string {
  const base = consoleBase(env);
  if (path === '/' || path === '') return base || '/';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** An absolute console URL, for emails and for links from the main site. */
export function consoleUrl(path = '/', env: Env = process.env): string {
  return `${consoleOrigin(env)}${consoleHref(path, env)}`;
}

// ---------------------------------------------------------------------------
// Host-based routing (used by src/proxy.ts)

export type RouteDecision =
  | { kind: 'next'; console: boolean }
  | { kind: 'rewrite'; path: string }
  | { kind: 'redirect'; location: string }
  | { kind: 'not-found' }
  | { kind: 'robots' };

/** API routes the console's own host serves: Auth.js, and checkout for the Buy page. */
const CONSOLE_APIS = ['/api/auth/', '/api/checkout'];

const underPrefix = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** A file in public/ or a Next asset: served as is on either host. */
function isAsset(pathname: string): boolean {
  return pathname.startsWith('/_next/') || /\/[^/]+\.[a-z0-9]{2,12}$/i.test(pathname);
}

/**
 * What to do with a request, by its Host header and path:
 *
 * - console host: `/x` is rewritten to `/console/x`; `/console/x` redirects to
 *   `/x` (absolute URLs: behind the tunnel the request itself is plain http); assets, /api/auth and /api/checkout pass; other APIs are 404;
 *   robots.txt disallows everything.
 * - any other host: `/account` redirects to the console. With the console on
 *   its own host, `/console/x` redirects there and /api/auth is 404 (sign-in
 *   happens on the console host only). In development both pass.
 */
export function routeRequest(host: string, pathname: string, search: string, env: Env = process.env): RouteDecision {
  const own = consoleHost(env);
  const onConsole = own !== null && host.toLowerCase() === own;

  if (onConsole) {
    if (pathname === '/robots.txt') return { kind: 'robots' };
    if (CONSOLE_APIS.some((p) => pathname.startsWith(p) || pathname === p.replace(/\/$/, ''))) return { kind: 'next', console: true };
    if (underPrefix(pathname, '/api')) return { kind: 'not-found' };
    if (isAsset(pathname)) return { kind: 'next', console: true };
    if (underPrefix(pathname, CONSOLE_PREFIX)) return { kind: 'redirect', location: `${consoleOrigin(env)}${pathname.slice(CONSOLE_PREFIX.length) || '/'}${search}` };
    return { kind: 'rewrite', path: `${CONSOLE_PREFIX}${pathname === '/' ? '' : pathname}${search}` };
  }

  if (underPrefix(pathname, '/account')) return { kind: 'redirect', location: consoleUrl('/', env) };
  if (underPrefix(pathname, CONSOLE_PREFIX)) {
    if (own === null) return { kind: 'next', console: true };
    return { kind: 'redirect', location: `${consoleOrigin(env)}${pathname.slice(CONSOLE_PREFIX.length) || '/'}${search}` };
  }
  if (underPrefix(pathname, '/api/auth')) return own === null ? { kind: 'next', console: true } : { kind: 'not-found' };
  return { kind: 'next', console: false };
}
