/**
 * The WebAuthn ceremony (SimpleWebAuthn), behind a small interface so the
 * passkey logic (./passkeys.ts) can be tested with a fake verifier.
 *
 * The relying party is the console: its origin (AUTH_URL) and that origin's
 * hostname as the RP ID (console.autotournament.gg; localhost in development).
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { consoleOrigin } from '../console/urls';

export type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON };

export type RelyingParty = { name: string; id: string; origin: string };

export function relyingParty(env: Record<string, string | undefined> = process.env): RelyingParty {
  const origin = consoleOrigin(env);
  return { name: 'Auto Tournament admin', id: new URL(origin).hostname, origin };
}

export type StoredCredential = { id: string; publicKey: Uint8Array; counter: number; transports: string[] };

export type Verifier = {
  registrationOptions(input: {
    rp: RelyingParty;
    userId: string;
    userName: string;
    exclude: { id: string; transports: string[] }[];
  }): Promise<PublicKeyCredentialCreationOptionsJSON>;
  verifyRegistration(input: { rp: RelyingParty; response: RegistrationResponseJSON; challenge: string }): Promise<{ verified: false } | { verified: true; credential: StoredCredential }>;
  authenticationOptions(input: { rp: RelyingParty; allow: { id: string; transports: string[] }[] }): Promise<PublicKeyCredentialRequestOptionsJSON>;
  verifyAuthentication(input: { rp: RelyingParty; response: AuthenticationResponseJSON; challenge: string; credential: StoredCredential }): Promise<{ verified: boolean; newCounter: number }>;
};

type Transport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';

export const simpleWebAuthn: Verifier = {
  registrationOptions: ({ rp, userId, userName, exclude }) =>
    generateRegistrationOptions({
      rpName: rp.name,
      rpID: rp.id,
      userName,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      excludeCredentials: exclude,
      // A passkey with a biometric or PIN check on the device.
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 120_000,
    }),
  async verifyRegistration({ rp, response, challenge }) {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    });
    if (!result.verified) return { verified: false };
    const c = result.registrationInfo.credential;
    return { verified: true, credential: { id: c.id, publicKey: c.publicKey, counter: c.counter, transports: c.transports ?? [] } };
  },
  authenticationOptions: ({ rp, allow }) =>
    generateAuthenticationOptions({
      rpID: rp.id,
      allowCredentials: allow,
      userVerification: 'required',
      timeout: 120_000,
    }),
  async verifyAuthentication({ rp, response, challenge, credential }) {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: { id: credential.id, publicKey: credential.publicKey as Uint8Array<ArrayBuffer>, counter: credential.counter, transports: credential.transports as Transport[] },
      requireUserVerification: true,
    });
    return { verified: result.verified, newCounter: result.authenticationInfo.newCounter };
  },
};
