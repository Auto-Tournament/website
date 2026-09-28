/**
 * License keys: the payload, how it is signed, and how a paid Checkout
 * Session turns into one. Pure apart from node:crypto (no process.env, no
 * Stripe client), so it is easy to test. scripts/license-verify.mjs is the
 * matching verifier; the format is described in the README ("License keys").
 *
 * Token: ATL1.<base64url(JSON payload)>.<base64url(Ed25519 signature over "ATL1.<payload>")>
 *
 * Relative imports on purpose: vitest runs this file without the `@/` alias.
 */
import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto';
import type { PackId, PackProduct, PackSize, Period } from '../../components/pricing';

export const TOKEN_PREFIX = 'ATL1';
/** updates_until for founder packs: updates for as long as the product is sold. */
export const LIFETIME = '9999-12-31';
/** An event license covers up to 5 days in a row (Commercial License Terms, section 5). */
export const EVENT_MAX_DAYS = 5;

export type LicensePayload = {
  v: 1;
  /** Which signing key; the products look up the public key by it. */
  kid: string;
  /** This license's own id, for support and the optional check-in. */
  id: string;
  /** Stripe customer id (cus_…), or the buyer's email when there is none. */
  customer: string;
  /** The business name given at checkout, shown in the products. */
  licensee?: string;
  product: PackProduct;
  pack: PackSize;
  max_servers: number;
  kind: Period;
  /** ISO 8601 UTC, to the second. */
  issued_at: string;
  /** YYYY-MM-DD, inclusive: releases whose version line (x.y.0) came out on or before this day are covered. */
  updates_until: string;
  /** YYYY-MM-DD, inclusive: the event window. Event licenses only. */
  valid_from?: string;
  valid_to?: string;
};

export type PublicJwk = { kty: 'OKP'; crv: 'Ed25519'; x: string };

export type SigningKey = { kid: string; privateKey: KeyObject; publicJwk: PublicJwk };

/** The kid is derived from the public key, so it can never disagree with it: the first 16 base64url characters of SHA-256(raw public key). */
export function kidFor(publicJwk: Pick<PublicJwk, 'x'>): string {
  return createHash('sha256').update(Buffer.from(publicJwk.x, 'base64url')).digest('base64url').slice(0, 16);
}

/** Reads a base64 (or base64url) PKCS#8 DER Ed25519 private key, as scripts/license-keygen.mjs prints it. Throws when it isn't one. */
export function signingKeyFrom(pkcs8Base64: string): SigningKey {
  const der = Buffer.from(pkcs8Base64.trim(), pkcs8Base64.includes('-') || pkcs8Base64.includes('_') ? 'base64url' : 'base64');
  const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('not an Ed25519 key');
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('no public key');
  const publicJwk: PublicJwk = { kty: 'OKP', crv: 'Ed25519', x: jwk.x };
  return { kid: kidFor(publicJwk), privateKey, publicJwk };
}

/** Signs `payload` into a token. The payload's kid must be this key's. */
export function signLicense(payload: LicensePayload, key: SigningKey): string {
  if (payload.kid !== key.kid) throw new Error('kid does not match the signing key');
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const input = `${TOKEN_PREFIX}.${body}`;
  const signature = sign(null, Buffer.from(input, 'ascii'), key.privateKey).toString('base64url');
  return `${input}.${signature}`;
}

// ---------------------------------------------------------------------------
// Dates

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function utcDay(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

/** Same day `months` later; the 31st becomes the last day of a shorter month. */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return isoDay(target);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Norwegian month names that don't start like the English ones. */
const MONTH_ALIASES: Record<string, number> = { mai: 5, okt: 10, des: 12 };

function monthNumber(word: string): number | null {
  const w = word.toLowerCase().slice(0, 3);
  const i = MONTHS.indexOf(w);
  if (i >= 0) return i + 1;
  return MONTH_ALIASES[w] ?? null;
}

/**
 * The dates in the free-text "Event date(s)" checkout field, earliest and
 * latest, or null when none can be read. Understands 2026-10-03,
 * 3.10.2026 / 3/10/2026 (day first), "3 October 2026", "3–5 October 2026",
 * "October 3, 2026" and "October 3–5, 2026".
 */
export function parseEventDates(text: string): { start: string; end: string } | null {
  const found: Date[] = [];
  const add = (y: number, m: number, d: number) => {
    const date = utcDay(y, m, d);
    if (date) found.push(date);
  };
  const s = text.slice(0, 200);

  for (const m of s.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) add(+m[1], +m[2], +m[3]);
  for (const m of s.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)) add(+m[3], +m[2], +m[1]);
  // "3 October 2026", "3-5 Oct 2026", "3. okt 2026"
  for (const m of s.matchAll(/\b(\d{1,2})\.?(?:\s*[-–—]\s*(\d{1,2})\.?)?\s+([A-Za-zæøåÆØÅ]{3,})\.?,?\s+(\d{4})\b/g)) {
    const month = monthNumber(m[3]);
    if (!month) continue;
    add(+m[4], month, +m[1]);
    if (m[2]) add(+m[4], month, +m[2]);
  }
  // "October 3, 2026", "Oct 3-5 2026"
  for (const m of s.matchAll(/\b([A-Za-z]{3,})\.?\s+(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const month = monthNumber(m[1]);
    if (!month) continue;
    add(+m[4], month, +m[2]);
    if (m[3]) add(+m[4], month, +m[3]);
  }

  if (found.length === 0) return null;
  const sorted = found.map(isoDay).sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

/** A start date from the form is used only when it is plausible: from 31 days before the purchase to 400 days after. */
function plausibleStart(start: string | undefined, purchaseDay: string): boolean {
  return start !== undefined && start >= addDays(purchaseDay, -31) && start <= addDays(purchaseDay, 400);
}

/**
 * The license dates for a purchase. Coverage is by version line: a release
 * is covered when its line date (the release date of its x.y.0) is on or
 * before `updates_until`, so later patches of a covered line stay covered.
 * - event: rights for the event window only, valid_from..valid_to: the dates
 *   from the form (at most 5 days from the first), or 5 days from the purchase
 *   when they can't be read. Updates until the last day.
 * - year: updates until 12 months after the purchase. No end to the rights:
 *   commercial use of covered lines continues after that.
 * - founder: updates for life (9999-12-31).
 */
export function licenseDates(
  kind: Period,
  purchaseDay: string,
  eventDates: string | undefined,
): { updates_until: string; valid_from?: string; valid_to?: string; fromForm: boolean } {
  if (kind === 'founder') return { updates_until: LIFETIME, fromForm: false };
  if (kind === 'year') return { updates_until: addMonths(purchaseDay, 12), fromForm: false };
  const parsed = eventDates ? parseEventDates(eventDates) : null;
  const fromForm = plausibleStart(parsed?.start, purchaseDay);
  const start = fromForm && parsed ? parsed.start : purchaseDay;
  const cap = addDays(start, EVENT_MAX_DAYS - 1);
  const end = fromForm && parsed && parsed.end < cap ? parsed.end : cap;
  return { updates_until: end, valid_from: start, valid_to: end, fromForm };
}

// ---------------------------------------------------------------------------
// From a Checkout Session

const packFromId: Record<PackId, { product: PackProduct; size: PackSize }> = {
  'servers-s': { product: 'servers', size: 'S' },
  'servers-m': { product: 'servers', size: 'M' },
  'servers-l': { product: 'servers', size: 'L' },
  'platform-s': { product: 'platform', size: 'S' },
  'platform-m': { product: 'platform', size: 'M' },
  'platform-l': { product: 'platform', size: 'L' },
};

export function isPackId(value: unknown): value is PackId {
  return typeof value === 'string' && Object.hasOwn(packFromId, value);
}

export function isPeriod(value: unknown): value is Period {
  return value === 'event' || value === 'year' || value === 'founder';
}

/** Only the Checkout Session fields a license needs, so tests can build one by hand. */
export type SessionLike = {
  id: string;
  status: string | null;
  payment_status: string;
  created: number;
  customer: string | { id: string } | null;
  customer_details: { email: string | null; business_name?: string | null } | null;
  collected_information?: { business_name?: string | null } | null;
  metadata: Record<string, string> | null;
  custom_fields?: { key: string; text?: { value?: string | null } | null }[] | null;
};

export type SessionCheck =
  | { ok: true; packId: PackId; kind: Period; metadataMaxServers: number | null }
  | { ok: false; reason: 'not_license' | 'not_paid' };

/** Whether the session is a paid license purchase from /api/checkout. */
export function checkSession(session: SessionLike): SessionCheck {
  const pack = session.metadata?.pack;
  const period = session.metadata?.period;
  if (!isPackId(pack) || !isPeriod(period)) return { ok: false, reason: 'not_license' };
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (session.status !== 'complete' || !paid) return { ok: false, reason: 'not_paid' };
  const raw = session.metadata?.max_servers;
  const n = raw && /^[1-9][0-9]{0,4}$/.test(raw) ? Number(raw) : null;
  return { ok: true, packId: pack, kind: period, metadataMaxServers: n };
}

export function sessionEmail(session: SessionLike): string | null {
  const email = session.customer_details?.email?.trim().toLowerCase();
  return email ? email : null;
}

function customField(session: SessionLike, key: string): string | undefined {
  const value = session.custom_fields?.find((f) => f.key === key)?.text?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Builds the payload for a paid session (checkSession first). */
export function payloadForSession(
  session: SessionLike,
  input: { kid: string; id: string; packId: PackId; kind: Period; maxServers: number; now: Date },
): { payload: LicensePayload; datesFromForm: boolean } {
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const customer = customerId || sessionEmail(session);
  if (!customer) throw new Error('the session has no customer or email');
  const licensee = (session.collected_information?.business_name ?? session.customer_details?.business_name ?? '').trim().slice(0, 200);
  const { product, size } = packFromId[input.packId];
  // The period counts from the payment day (the session's creation is within a day of it).
  const purchaseDay = isoDay(input.now);
  const dates = licenseDates(input.kind, purchaseDay, customField(session, 'eventdates'));

  const payload: LicensePayload = {
    v: 1,
    kid: input.kid,
    id: input.id,
    customer,
    ...(licensee ? { licensee } : {}),
    product,
    pack: size,
    max_servers: input.maxServers,
    kind: input.kind,
    issued_at: `${input.now.toISOString().slice(0, 19)}Z`,
    updates_until: dates.updates_until,
    ...(dates.valid_from ? { valid_from: dates.valid_from, valid_to: dates.valid_to } : {}),
  };
  return { payload, datesFromForm: dates.fromForm };
}

/** SHA-256 of the lowercased email, hex. The store keeps this, never the email. */
export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');
}

/** Checkout Session ids look like cs_live_… / cs_test_…. */
export const CHECKOUT_SESSION_ID = /^cs_(?:live|test)_[A-Za-z0-9]{10,250}$/;
