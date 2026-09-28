import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The /account session cookie: `<session id>.<HMAC-SHA256(ACCOUNT_SESSION_SECRET, id)>`.
 * The id is random (32 bytes); the account store keeps only its hash. The
 * signature lets a forged or truncated cookie be refused before any lookup.
 *
 * No Next import and no process.env read at import, so it is easy to test.
 */

/** __Host-: Secure, Path=/ and no Domain, so no subdomain can set or read it. */
export const SESSION_COOKIE = '__Host-at-account';
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
/** Shorter secrets are refused: the feature stays off. */
export const MIN_SECRET_LENGTH = 32;

export function accountSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.ACCOUNT_SESSION_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function mac(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id, 'utf8').digest('base64url');
}

export function signSession(id: string, secret: string): string {
  return `${id}.${mac(id, secret)}`;
}

/** The session id in a cookie value, or null when it isn't one we signed. */
export function verifySession(value: string | undefined, secret: string): string | null {
  if (!value || value.length > 200) return null;
  const m = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return null;
  const expected = Buffer.from(mac(m[1], secret));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? m[1] : null;
}

export function sessionCookie(value: string): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
