import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db/client';
import { consoleOrigin } from '@/lib/console/urls';
import type { ConsoleUser } from '@/lib/console/orgs';
import { adminGate, PasskeyError, verifyApproval, type ApprovalAction, type Gate } from './passkeys';
import { relyingParty, simpleWebAuthn } from './webauthn';

/**
 * The passkey layer for the admin pages and actions (./passkeys.ts): which
 * gate this session is at, and whether a form carries a fresh passkey
 * approval for its action.
 */

/** The Auth.js session cookie (src/lib/console/auth.ts): __Host- on https. */
export const sessionCookieName = () => (consoleOrigin().startsWith('https://') ? '__Host-authjs.session-token' : 'authjs.session-token');

/** SHA-256 of this request's session cookie: the key of its row in `sessions` (src/lib/console/adapter.ts). */
export async function currentSessionHash(): Promise<string | null> {
  const value = (await cookies()).get(sessionCookieName())?.value;
  return value ? createHash('sha256').update(value, 'utf8').digest('hex') : null;
}

export async function gateFor(user: ConsoleUser): Promise<Gate> {
  return adminGate(db(), user.id, await currentSessionHash());
}

export const gateText: Record<Exclude<Gate, 'ok'>, string> = {
  setup: 'Set up a passkey on the admin page first.',
  verify: 'Check your passkey on the admin page first (once per session, 12 hours).',
};

/** Null when the form's `passkey` field is a valid approval of `action` on `target`; otherwise what to tell the admin. */
export async function approvalError(user: ConsoleUser, action: ApprovalAction, target: string, fd: FormData): Promise<string | null> {
  try {
    await verifyApproval(db(), user, action, target, fd.get('passkey'), { verifier: simpleWebAuthn, rp: relyingParty() });
    return null;
  } catch (err) {
    if (err instanceof PasskeyError) return err.message;
    console.error('[admin] passkey approval failed', err instanceof Error ? err.name : 'unknown error');
    return 'The passkey check failed. Try again.';
  }
}
