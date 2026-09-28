import { publishedPublicKeys } from '@/lib/license/keys';

// The public keys that verify Auto Tournament license keys, by kid:
// { "keys": { "<kid>": { "kty": "OKP", "crv": "Ed25519", "x": "<base64url>" } } }.
// Products embed these at build time; this is for tooling and checking. Public.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { alg: 'Ed25519', format: 'ATL1', keys: publishedPublicKeys() },
    { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } },
  );
}
