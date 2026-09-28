#!/usr/bin/env node
/**
 * Reference verifier for Auto Tournament license keys. Offline: no network,
 * only node:crypto and the public keys in src/lib/license/public-keys.json
 * (or ones you pass in). Ready Up and the platform port this logic.
 *
 * Token: ATL1.<payload>.<signature>
 *   payload   = base64url (no padding) of the UTF-8 JSON payload
 *   signature = base64url (no padding) of the 64-byte Ed25519 signature over
 *               the ASCII bytes of "ATL1.<payload>"
 * The payload's `kid` picks the public key.
 *
 * Nothing here ever blocks. verifyLicense() returns
 *   { valid, status: 'ok' | 'warning' | 'invalid', warnings: [{ code, message }], license }
 * and the products only show the warnings.
 *
 * Coverage is by version line: every release carries `line_date`, the
 * release date of its major.minor line (x.y.0). The release is covered when
 * line_date <= updates_until, so later patches of a covered line stay covered
 * after the updates end.
 *
 * CLI:
 *   node scripts/license-verify.mjs <token> [--line-date YYYY-MM-DD] [--servers N]
 *        [--product servers|platform] [--now YYYY-MM-DD] [--keys file.json]
 * Exits 0 for ok or warning, 1 for an invalid key, 2 for bad usage.
 */
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TOKEN_PREFIX = 'ATL1';
export const MAX_TOKEN_LENGTH = 4096;
export const LIFETIME = '9999-12-31';

const B64URL = /^[A-Za-z0-9_-]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRODUCTS = ['servers', 'platform'];
const PACKS = ['S', 'M', 'L'];
const KINDS = ['event', 'year', 'founder'];

/** The public keys shipped with this repo: { kid: { kty: 'OKP', crv: 'Ed25519', x } }. */
export function embeddedPublicKeys() {
  const file = new URL('../src/lib/license/public-keys.json', import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')).keys ?? {};
}

function isDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today (UTC) as YYYY-MM-DD, or a Date / date string turned into one. */
function day(value) {
  if (value === undefined || value === null) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && isDate(value.slice(0, 10))) return value.slice(0, 10);
  throw new TypeError(`not a date: ${String(value)}`);
}

/** Checks the payload's shape. Returns an error message, or null when it is a v1 license. */
export function payloadProblem(p) {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return 'payload is not an object';
  if (p.v !== 1) return `unsupported version ${JSON.stringify(p.v)}`;
  if (typeof p.kid !== 'string' || !p.kid) return 'missing kid';
  if (typeof p.id !== 'string' || !p.id) return 'missing id';
  if (typeof p.customer !== 'string' || !p.customer) return 'missing customer';
  if (!PRODUCTS.includes(p.product)) return 'bad product';
  if (!PACKS.includes(p.pack)) return 'bad pack';
  if (!Number.isSafeInteger(p.max_servers) || p.max_servers < 1) return 'bad max_servers';
  if (!KINDS.includes(p.kind)) return 'bad kind';
  if (typeof p.issued_at !== 'string' || Number.isNaN(Date.parse(p.issued_at))) return 'bad issued_at';
  if (!isDate(p.updates_until)) return 'bad updates_until';
  if ((p.valid_from === undefined) !== (p.valid_to === undefined)) return 'valid_from and valid_to go together';
  if (p.valid_from !== undefined && (!isDate(p.valid_from) || !isDate(p.valid_to) || p.valid_from > p.valid_to)) return 'bad valid_from/valid_to';
  if (p.licensee !== undefined && typeof p.licensee !== 'string') return 'bad licensee';
  return null;
}

/** Splits and decodes a token without checking the signature. Throws on a malformed token. */
export function decodeLicense(token) {
  if (typeof token !== 'string') throw new Error('not a string');
  const t = token.trim();
  if (t.length > MAX_TOKEN_LENGTH) throw new Error('too long');
  const parts = t.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) throw new Error(`not an ${TOKEN_PREFIX} key`);
  const [, body, sig] = parts;
  if (!B64URL.test(body) || !B64URL.test(sig)) throw new Error('not base64url');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  const signature = Buffer.from(sig, 'base64url');
  if (signature.length !== 64) throw new Error('bad signature length');
  return { payload, signature, signed: Buffer.from(`${TOKEN_PREFIX}.${body}`, 'ascii') };
}

function invalid(code, message) {
  return { valid: false, status: 'invalid', warnings: [{ code, message }], license: null };
}

/**
 * @param {string} token
 * @param {{ publicKeys?: Record<string, { kty: string; crv: string; x: string }>, lineDate?: string | Date,
 *           serverCount?: number, product?: 'servers' | 'platform', now?: string | Date }} [options]
 *   lineDate: release date of the running release's x.y.0 line (baked into each release). Defaults to today.
 *   serverCount: game servers set up right now; omitted means not checked.
 *   product: which product is checking. A Servers key used for the platform warns.
 *   now: today's date, for an event license's window. Defaults to today.
 */
export function verifyLicense(token, options = {}) {
  const publicKeys = options.publicKeys ?? embeddedPublicKeys();

  let decoded;
  try {
    decoded = decodeLicense(token);
  } catch (err) {
    return invalid('malformed', `This is not a valid license key (${err instanceof Error ? err.message : 'unreadable'}).`);
  }
  const { payload, signature, signed } = decoded;

  if (typeof payload?.v === 'number' && payload.v !== 1) {
    return invalid('unsupported_version', `License key version ${payload.v} needs a newer release.`);
  }
  const jwk = typeof payload?.kid === 'string' && Object.hasOwn(publicKeys, payload.kid) ? publicKeys[payload.kid] : null;
  if (!jwk) return invalid('unknown_kid', 'This license key was signed with a key this release does not know.');

  let ok = false;
  try {
    const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
    ok = verify(null, signed, key, signature);
  } catch {
    ok = false;
  }
  if (!ok) return invalid('bad_signature', 'The license key signature does not match: the key was changed or mistyped.');

  const problem = payloadProblem(payload);
  if (problem) return invalid('malformed', `The license key content is not valid (${problem}).`);

  const warnings = [];
  const line = day(options.lineDate);
  const today = day(options.now);

  if (line > payload.updates_until) {
    warnings.push({
      code: 'updates_expired',
      message: `This release line came out on ${line}, after the license's updates ended on ${payload.updates_until}. Renew updates, or stay on a release line from before then.`,
    });
  }
  if (payload.valid_to !== undefined && today > payload.valid_to) {
    warnings.push({ code: 'period_ended', message: `The event license window ended on ${payload.valid_to}.` });
  }
  if (payload.valid_from !== undefined && today < payload.valid_from) {
    warnings.push({ code: 'period_not_started', message: `The event license window starts on ${payload.valid_from}.` });
  }
  if (typeof options.serverCount === 'number' && options.serverCount > payload.max_servers) {
    warnings.push({
      code: 'too_many_servers',
      message: `${options.serverCount} servers are set up, above this license's ${payload.max_servers}.`,
    });
  }
  if (options.product === 'platform' && payload.product === 'servers') {
    warnings.push({ code: 'wrong_product', message: 'This is a Servers license; the platform needs a Platform license.' });
  }

  return { valid: true, status: warnings.length ? 'warning' : 'ok', warnings, license: payload };
}

function usage() {
  console.error(
    'Usage: node scripts/license-verify.mjs <token> [--line-date YYYY-MM-DD] [--servers N] [--product servers|platform] [--now YYYY-MM-DD] [--keys file.json]',
  );
  process.exit(2);
}

function main(argv) {
  let token = null;
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => (i + 1 < argv.length ? argv[++i] : usage());
    if (arg === '--line-date') options.lineDate = next();
    else if (arg === '--now') options.now = next();
    else if (arg === '--servers') options.serverCount = Number(next());
    else if (arg === '--product') options.product = next();
    else if (arg === '--keys') {
      const parsed = JSON.parse(readFileSync(next(), 'utf8'));
      options.publicKeys = parsed.keys ?? parsed;
    } else if (arg.startsWith('--') || token !== null) usage();
    else token = arg;
  }
  if (!token) usage();
  if (options.serverCount !== undefined && !Number.isInteger(options.serverCount)) usage();
  for (const d of [options.lineDate, options.now]) if (d !== undefined && !isDate(d)) usage();

  const result = verifyLicense(token, options);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
