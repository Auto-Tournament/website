'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import { sessions } from '@/lib/db/schema';
import { sameOrigin } from '@/lib/site';
import { audit } from '@/lib/console/audit';
import { consoleEnabled } from '@/lib/console/auth';
import { passkeyAddedEmail, passkeyLinkEmail } from '@/lib/console/emails';
import { limits } from '@/lib/console/limits';
import type { ConsoleUser } from '@/lib/console/orgs';
import { currentUser } from '@/lib/console/session';
import { consoleOrigin, consoleUrl } from '@/lib/console/urls';
import { emailConfig, sendEmail } from '@/lib/email/postmark';
import { isAdminUser } from '@/lib/admin/access';
import { approvalError, currentSessionHash, gateText } from '@/lib/admin/approval';
import {
  adminGate,
  approvalOptions,
  completeRegistration,
  createPasskeyLink,
  isApprovalAction,
  markSessionVerified,
  parseCredentialJson,
  PasskeyError,
  registrationOptions,
  removePasskey,
  renamePasskey,
  sessionVerified,
  SESSION_ACTION,
  verifyApproval,
} from '@/lib/admin/passkeys';
import { relyingParty, simpleWebAuthn, type RegistrationResponseJSON } from '@/lib/admin/webauthn';
import type { ActionState } from '../actions';

/**
 * The admin passkey actions (src/lib/admin/passkeys.ts). Like every admin
 * action: same-origin, an admin right now (anyone else gets "Not found."),
 * rate-limited, audited. These work before the passkey gate is passed (they
 * are how it is passed); the rest of the admin CRM needs it.
 */

export type PasskeyState = (NonNullable<ActionState> & { options?: unknown }) | null;

const text = (fd: FormData, key: string, max = 400): string => {
  const v = fd.get(key);
  return typeof v === 'string' ? v.slice(0, max) : '';
};

async function passkeyAdmin(): Promise<{ user: ConsoleUser; session: string | null } | { error: string }> {
  if (!consoleEnabled()) return { error: 'Not found.' };
  const h = (await headers()) as unknown as Headers;
  if (!sameOrigin(h, consoleOrigin())) return { error: 'Forbidden.' };
  const user = await currentUser();
  if (!user || !isAdminUser(user)) return { error: 'Not found.' };
  if (!limits.passkey(user.id, Date.now())) return { error: 'Too many passkey attempts. Wait a few minutes.' };
  return { user, session: await currentSessionHash() };
}

function failed(err: unknown): PasskeyState {
  if (err instanceof PasskeyError) return { error: err.message };
  console.error('[admin] passkey action failed', dbError(err));
  return { error: 'Something went wrong. Try again.' };
}

const deps = () => ({ verifier: simpleWebAuthn, rp: relyingParty() });
const refresh = () => revalidatePath('/console', 'layout');

/** Emails the admin's own address a link to add a passkey ('register') or to recover ('recover'). */
export async function requestPasskeyLinkAction(_prev: PasskeyState, fd: FormData): Promise<PasskeyState> {
  const w = await passkeyAdmin();
  if ('error' in w) return { error: w.error };
  const purpose = text(fd, 'purpose', 10) === 'recover' ? 'recover' : 'register';
  if (!limits.passkeyLink(w.user.id, Date.now())) return { error: 'Too many passkey emails in the last hour. Wait a while.' };
  const to = w.user.email;
  if (!to) return { error: 'Not found.' };
  const config = emailConfig();
  if (!config && process.env.NODE_ENV === 'production') return { error: 'Passkeys are added through an email link, and email isn’t set up here (POSTMARK_SERVER_TOKEN).' };
  try {
    const verified = await sessionVerified(db(), w.user.id, w.session);
    const token = await createPasskeyLink(db(), w.user, purpose, { sessionVerified: verified });
    const link = `${consoleUrl('/passkeys/add')}?token=${encodeURIComponent(token)}`;
    if (!config) {
      // Development only (as the sign-in link): no Postmark, so the link goes to the server log.
      console.info(`[admin] POSTMARK_SERVER_TOKEN is unset; development passkey link: ${link}`);
    } else {
      const sent = await sendEmail({ to, ...passkeyLinkEmail({ link, purpose }), tag: 'admin-passkey-link' }, config);
      if (!sent.ok) {
        console.error('[admin] passkey link email failed', { error: sent.error });
        return { error: 'The email could not be sent. Try again in a few minutes.' };
      }
    }
  } catch (err) {
    return failed(err);
  }
  return { ok: purpose === 'recover' ? 'Check your email. A passkey added through recovery starts to work 24 hours later.' : 'Check your email for the link to add a passkey (15 minutes).' };
}

/** Registration options for the passkey link on the page it opens. */
export async function passkeyRegistrationOptionsAction(_prev: PasskeyState, fd: FormData): Promise<PasskeyState> {
  const w = await passkeyAdmin();
  if ('error' in w) return { error: w.error };
  try {
    const verified = await sessionVerified(db(), w.user.id, w.session);
    return { options: await registrationOptions(db(), w.user, text(fd, 'token', 64), { ...deps(), sessionVerified: verified }) };
  } catch (err) {
    return failed(err);
  }
}

/** Stores the new passkey and emails the admin that it was added (a warning for a recovery one). */
export async function completePasskeyRegistrationAction(_prev: PasskeyState, fd: FormData): Promise<PasskeyState> {
  const w = await passkeyAdmin();
  if ('error' in w) return { error: w.error };
  const response = parseCredentialJson<RegistrationResponseJSON>(fd.get('response'));
  if (!response) return { error: 'The passkey response is not valid. Try again.' };
  let registered: Awaited<ReturnType<typeof completeRegistration>>;
  try {
    const verified = await sessionVerified(db(), w.user.id, w.session);
    registered = await completeRegistration(db(), w.user, text(fd, 'token', 64), { name: text(fd, 'name', 60), response }, { ...deps(), sessionVerified: verified });
  } catch (err) {
    return failed(err);
  }
  const config = emailConfig();
  if (config && w.user.email) {
    const mail = passkeyAddedEmail({ name: registered.passkey.name, recovery: registered.recovery, usableFrom: registered.passkey.usableFrom, manageLink: consoleUrl('/admin/passkeys') });
    const sent = await sendEmail({ to: w.user.email, ...mail, tag: 'admin-passkey-added' }, config);
    if (!sent.ok) console.error('[admin] passkey added email failed', { error: sent.error });
  }
  refresh();
  return {
    ok: registered.recovery
      ? `Passkey added. It starts to work at ${registered.passkey.usableFrom.toISOString().slice(0, 16).replace('T', ' ')} UTC; a warning went to your email.`
      : 'Passkey added.',
  };
}

/**
 * Options for a passkey check of an action. 'admin.session' (opening /admin)
 * is bound to this session on the server; any other needs the session check
 * passed already.
 */
export async function approvalOptionsAction(_prev: PasskeyState, fd: FormData): Promise<PasskeyState> {
  const w = await passkeyAdmin();
  if ('error' in w) return { error: w.error };
  const action = text(fd, 'action', 40);
  if (!isApprovalAction(action)) return { error: 'Unknown action.' };
  try {
    const gate = await adminGate(db(), w.user.id, w.session);
    if (gate === 'setup') return { error: gateText.setup };
    if (action === SESSION_ACTION) {
      if (!w.session) return { error: 'Your session has ended. Sign in again.' };
      return { options: await approvalOptions(db(), w.user, action, w.session, deps()) };
    }
    if (gate !== 'ok') return { error: gateText.verify };
    return { options: await approvalOptions(db(), w.user, action, text(fd, 'target', 200), deps()) };
  } catch (err) {
    return failed(err);
  }
}

/** The once-per-session passkey check that opens /admin (12 hours). */
export async function verifySessionAction(_prev: PasskeyState, fd: FormData): Promise<PasskeyState> {
  const w = await passkeyAdmin();
  if ('error' in w) return { error: w.error };
  if (!w.session) return { error: 'Your session has ended. Sign in again.' };
  try {
    const key = await verifyApproval(db(), w.user, SESSION_ACTION, w.session, fd.get('passkey'), deps());
    await markSessionVerified(db(), w.user, w.session, key.id);
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Passkey checked.' };
}

export async function renamePasskeyAction(_prev: PasskeyState, fd: FormData): Promise<PasskeyState> {
  const w = await passkeyAdmin();
  if ('error' in w) return { error: w.error };
  if ((await adminGate(db(), w.user.id, w.session)) !== 'ok') return { error: gateText.verify };
  try {
    await renamePasskey(db(), w.user, text(fd, 'passkeyId', 64), text(fd, 'name', 60));
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Renamed.' };
}

/** Removing a passkey needs a passkey approval for it; never the last working one. */
export async function removePasskeyAction(_prev: PasskeyState, fd: FormData): Promise<PasskeyState> {
  const w = await passkeyAdmin();
  if ('error' in w) return { error: w.error };
  if ((await adminGate(db(), w.user.id, w.session)) !== 'ok') return { error: gateText.verify };
  const id = text(fd, 'passkeyId', 64);
  const refused = await approvalError(w.user, 'passkey.remove', id, fd);
  if (refused) return { error: refused };
  try {
    await removePasskey(db(), w.user, id);
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Passkey removed.' };
}

/** Signs this admin out of every console session (this one too). */
export async function signOutEverywhereAction(_prev: PasskeyState, _fd: FormData): Promise<PasskeyState> {
  const w = await passkeyAdmin();
  if ('error' in w) return { error: w.error };
  try {
    const gone = await db().delete(sessions).where(eq(sessions.userId, w.user.id)).returning({ x: sessions.userId });
    await audit(db(), { actor: w.user.id, action: 'auth.signout_everywhere', targetType: 'user', targetId: w.user.id, details: { sessions: gone.length } });
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Signed out everywhere. Sign in again with a new email link.' };
}
