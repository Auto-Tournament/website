#!/usr/bin/env node
/**
 * Makes a new Ed25519 key pair for signing Auto Tournament license keys.
 * Run it once on your own machine (and again only to rotate):
 *
 *   node scripts/license-keygen.mjs
 *
 * It prints:
 * - LICENSE_SIGNING_KEY=…  the PRIVATE key. Put it in the website's .env on
 *   the server, and in your password manager. Never commit it, paste it in a
 *   chat or an issue, or put it in a product.
 * - the kid and public key, as a line for src/lib/license/public-keys.json
 *   (commit that) and for the products to embed.
 *
 * Nothing is written to disk.
 */
import { createHash, generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const { x } = publicKey.export({ format: 'jwk' });
// Same derivation as kidFor() in src/lib/license/format.ts.
const kid = createHash('sha256').update(Buffer.from(x, 'base64url')).digest('base64url').slice(0, 16);
const jwk = { kty: 'OKP', crv: 'Ed25519', x };

console.log(`# PRIVATE: goes in the website's .env only (and your password manager). Never commit or share it.
LICENSE_SIGNING_KEY=${pkcs8}

# Public: kid ${kid}
# 1. Add this entry under "keys" in src/lib/license/public-keys.json and commit it
#    (keep old entries there when you rotate, so older license keys still verify):
${JSON.stringify({ [kid]: jwk })}
# 2. Products embed the same kid and x (the raw 32-byte Ed25519 public key, base64url):
#    kid=${kid}
#    x=${x}`);
