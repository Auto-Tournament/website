// Types for scripts/license-verify.mjs, so the TypeScript tests can import it.
export type PublicJwk = { kty: string; crv: string; x: string };
export type LicenseWarning = { code: string; message: string };
export type LicensePayloadV1 = {
  v: 1;
  kid: string;
  id: string;
  customer: string;
  licensee?: string;
  product: 'servers' | 'platform';
  pack: 'S' | 'M' | 'L';
  max_servers: number;
  kind: 'event' | 'year' | 'founder';
  issued_at: string;
  updates_until: string;
  valid_from?: string;
  valid_to?: string;
};
export type VerifyResult = {
  valid: boolean;
  status: 'ok' | 'warning' | 'invalid';
  warnings: LicenseWarning[];
  license: LicensePayloadV1 | null;
};
export type VerifyOptions = {
  publicKeys?: Record<string, PublicJwk>;
  lineDate?: string | Date;
  serverCount?: number;
  product?: 'servers' | 'platform';
  now?: string | Date;
};
export const TOKEN_PREFIX: 'ATL1';
export const MAX_TOKEN_LENGTH: number;
export const LIFETIME: '9999-12-31';
export function embeddedPublicKeys(): Record<string, PublicJwk>;
export function payloadProblem(p: unknown): string | null;
export function decodeLicense(token: string): { payload: unknown; signature: Buffer; signed: Buffer };
export function verifyLicense(token: string, options?: VerifyOptions): VerifyResult;
