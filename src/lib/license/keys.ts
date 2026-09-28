import 'server-only';
import embedded from './public-keys.json';
import { kidFor, signingKeyFrom, type PublicJwk, type SigningKey } from './format';

/**
 * Signing and public keys, from the environment at runtime:
 *
 * - `LICENSE_SIGNING_KEY`: the Ed25519 private key, base64 PKCS#8 DER, as
 *   `node scripts/license-keygen.mjs` prints it. Unset means no keys are
 *   issued (the webhook answers 503 so Stripe retries later, and the thanks
 *   page says the key follows by email).
 *
 * Public keys: every key in src/lib/license/public-keys.json (committed,
 * including retired ones) plus the current signing key's.
 */

let cached: { raw: string; key: SigningKey | null } | null = null;

export function licenseSigningKey(): SigningKey | null {
  const raw = (process.env.LICENSE_SIGNING_KEY ?? '').trim();
  if (cached?.raw === raw) return cached.key;
  let key: SigningKey | null = null;
  if (raw) {
    try {
      key = signingKeyFrom(raw);
    } catch (err) {
      console.error('[license] LICENSE_SIGNING_KEY is not a base64 PKCS#8 Ed25519 key; no license keys are issued', err instanceof Error ? err.message : '');
    }
  }
  cached = { raw, key };
  return key;
}

/** kid → public key (JWK), for /api/license/public-keys. */
export function publishedPublicKeys(): Record<string, PublicJwk> {
  const keys: Record<string, PublicJwk> = {};
  for (const [kid, jwk] of Object.entries((embedded as { keys: Record<string, PublicJwk> }).keys)) {
    // A kid that doesn't match its key is a copy-paste mistake: skip it rather than publish it.
    if (jwk && typeof jwk.x === 'string' && kidFor(jwk) === kid) keys[kid] = { kty: 'OKP', crv: 'Ed25519', x: jwk.x };
    else console.warn(`[license] public-keys.json: kid ${kid} does not match its key; not published`);
  }
  const current = licenseSigningKey();
  if (current) keys[current.kid] = current.publicJwk;
  return keys;
}
