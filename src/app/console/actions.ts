'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { AuthError } from 'next-auth';
import { clientIp } from '@/lib/checkout';
import { db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import type { Role } from '@/lib/db/schema';
import { emailConfig, sendEmail } from '@/lib/email/postmark';
import { emailHash } from '@/lib/license/format';
import { sameOrigin } from '@/lib/site';
import { audit } from '@/lib/console/audit';
import { consoleEnabled, googleEnabled, signIn, signOut } from '@/lib/console/auth';
import { inviteEmail } from '@/lib/console/emails';
import { limits } from '@/lib/console/limits';
import {
  acceptInvite,
  changeRole,
  claimLicense,
  ConsoleError,
  createInvite,
  createOrg,
  EMAIL,
  getOrg,
  isRole,
  removeMember,
  revokeInvite,
  updateOrg,
  validateOrgInput,
  type ConsoleUser,
  type OrgInput,
} from '@/lib/console/orgs';
import { currentUser, setCurrentOrg } from '@/lib/console/session';
import { billingPortal, stripeLivemode } from '@/lib/console/stripe';
import { consoleHref, consoleOrigin, consoleUrl } from '@/lib/console/urls';

/**
 * Every console write. Server Actions: Next checks that the request's Origin
 * matches its host, and each action also checks Sec-Fetch-Site/Origin like the
 * site's other POST routes, signs the user in again from the session, checks
 * membership and role in the query (src/lib/console/orgs.ts), and is
 * rate-limited. Bodies are capped in next.config.ts (serverActions.bodySizeLimit).
 */

export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string> } | null;

const text = (fd: FormData, key: string, max = 400): string => {
  const v = fd.get(key);
  return typeof v === 'string' ? v.slice(0, max) : '';
};

async function request() {
  const h = await headers();
  return { ip: clientIp(h as unknown as Headers), sameOrigin: sameOrigin(h as unknown as Headers, consoleOrigin()) };
}

/** The signed-in user for a write, or an error state. */
async function writer(limit = true): Promise<{ user: ConsoleUser } | { error: string }> {
  if (!consoleEnabled()) return { error: "The console isn't available right now." };
  const req = await request();
  if (!req.sameOrigin) return { error: 'Forbidden.' };
  const user = await currentUser();
  if (!user) return { error: 'Your session has ended. Sign in again.' };
  if (limit && !limits.write(user.id, Date.now())) return { error: 'Too many changes at once. Wait a minute.' };
  return { user };
}

function failed(err: unknown): ActionState {
  if (err instanceof ConsoleError) return { error: err.message };
  console.error('[console] action failed', dbError(err));
  return { error: 'Something went wrong. Try again.' };
}

const refresh = () => revalidatePath('/console', 'layout');

// ---------------------------------------------------------------------------
// Sign-in

export async function signInWithEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!consoleEnabled()) return { error: "Signing in isn't available right now." };
  const req = await request();
  if (!req.sameOrigin) return { error: 'Forbidden.' };
  const email = text(fd, 'email', 300).trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { error: 'Enter your email address.' };
  if (!limits.signInIp(req.ip, Date.now())) return { error: 'Too many sign-in attempts. Wait 10 minutes and try again.' };
  // Over the per-address limit: nothing is sent, and the answer is the same.
  if (limits.signInEmail(emailHash(email), Date.now())) {
    try {
      await signIn('email', { email, redirectTo: consoleUrl('/'), redirect: false });
    } catch (err) {
      if (err instanceof AuthError) {
        console.warn('[console] email sign-in failed', err.type);
        return { error: "Couldn't send the sign-in email. Try again in a few minutes." };
      }
      throw err;
    }
  }
  redirect(consoleHref('/signin/check-email'));
}

export async function signInWithGoogle(): Promise<ActionState> {
  if (!consoleEnabled() || !googleEnabled()) return { error: "Google sign-in isn't available." };
  const req = await request();
  if (!req.sameOrigin) return { error: 'Forbidden.' };
  if (!limits.signInIp(req.ip, Date.now())) return { error: 'Too many sign-in attempts. Wait 10 minutes and try again.' };
  // Redirects to Google (throws Next's redirect).
  await signIn('google', { redirectTo: consoleUrl('/') });
  return null;
}

export async function signOutAction(): Promise<void> {
  const req = await request();
  if (!req.sameOrigin) return;
  const user = await currentUser();
  if (user) await audit(db(), { actor: user.id, action: 'auth.signout', targetType: 'user', targetId: user.id }).catch(() => {});
  await signOut({ redirectTo: consoleHref('/signin') });
}

// ---------------------------------------------------------------------------
// Organizations

function orgFields(fd: FormData): Record<string, string> {
  const keys: (keyof OrgInput)[] = ['name', 'orgNumber', 'vatId', 'country', 'addressLine1', 'addressLine2', 'postalCode', 'city'];
  return Object.fromEntries(keys.map((k) => [k, text(fd, k)]));
}

export async function createOrgAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  const checked = validateOrgInput(orgFields(fd));
  if (!checked.ok) return { error: 'Check the fields marked below.', fieldErrors: checked.errors };
  let orgId: string;
  try {
    orgId = await createOrg(db(), w.user, checked.value);
  } catch (err) {
    return failed(err);
  }
  await setCurrentOrg(orgId);
  refresh();
  redirect(consoleHref('/licenses'));
}

export async function updateOrgAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  const checked = validateOrgInput(orgFields(fd));
  if (!checked.ok) return { error: 'Check the fields marked below.', fieldErrors: checked.errors };
  try {
    await updateOrg(db(), w.user, text(fd, 'orgId', 64), checked.value);
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Saved.' };
}

export async function switchOrgAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  const orgId = text(fd, 'orgId', 64);
  const org = await getOrg(db(), w.user.id, orgId);
  if (!org) return { error: 'No such organization.' };
  await setCurrentOrg(org.id);
  refresh();
  // Back to the same console page, never anywhere else.
  const next = text(fd, 'next', 40);
  redirect(consoleHref(['/licenses', '/members', '/billing', '/buy'].includes(next) ? next : '/licenses'));
}

// ---------------------------------------------------------------------------
// Members and invites

export async function inviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  const orgId = text(fd, 'orgId', 64);
  const email = text(fd, 'email', 300);
  const role = text(fd, 'role', 20);
  if (!isRole(role)) return { error: 'Choose a role.' };
  const now = Date.now();
  if (!limits.inviteUser(w.user.id, now) || !limits.inviteOrg(orgId, now)) return { error: 'Too many invites. Try again later.' };
  let invite: Awaited<ReturnType<typeof createInvite>>;
  try {
    invite = await createInvite(db(), w.user, orgId, email, role as Role);
  } catch (err) {
    return failed(err);
  }
  refresh();
  const link = `${consoleUrl('/invite')}?token=${invite.token}`;
  const config = emailConfig();
  if (!config) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[console] POSTMARK_SERVER_TOKEN is unset; development invite link: ${link}`);
      return { ok: `Invite created for ${invite.email}. Email is off here, so the link is in the server log.` };
    }
    return { ok: `Invite created for ${invite.email}, but email isn't set up: they can sign in with that address to see it.` };
  }
  const mail = inviteEmail({ link, orgName: invite.orgName, inviter: w.user.name || w.user.email || 'Someone', role });
  const sent = await sendEmail({ to: invite.email, ...mail, tag: 'console-invite' }, config);
  if (!sent.ok) {
    console.error('[console] invite email failed', { invite: invite.id, error: sent.error });
    return { ok: `Invite created, but the email couldn't be sent. ${invite.email} can sign in with that address to see it.` };
  }
  return { ok: `Invite sent to ${invite.email}.` };
}

export async function revokeInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  try {
    await revokeInvite(db(), w.user, text(fd, 'orgId', 64), text(fd, 'inviteId', 64));
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Invite revoked.' };
}

export async function acceptInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  const token = text(fd, 'token', 64);
  const inviteId = text(fd, 'inviteId', 64);
  let orgId: string;
  try {
    orgId = await acceptInvite(db(), w.user, token ? { token } : { id: inviteId });
  } catch (err) {
    return failed(err);
  }
  await setCurrentOrg(orgId);
  refresh();
  redirect(consoleHref('/licenses'));
}

export async function changeRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  const role = text(fd, 'role', 20);
  if (!isRole(role)) return { error: 'Choose a role.' };
  try {
    await changeRole(db(), w.user, text(fd, 'orgId', 64), text(fd, 'userId', 64), role);
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Role changed.' };
}

export async function removeMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  const target = text(fd, 'userId', 64);
  try {
    await removeMember(db(), w.user, text(fd, 'orgId', 64), target);
  } catch (err) {
    return failed(err);
  }
  refresh();
  if (target === w.user.id) redirect(consoleHref('/'));
  return { ok: 'Member removed.' };
}

// ---------------------------------------------------------------------------
// Licenses and billing

export async function claimLicenseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer();
  if ('error' in w) return { error: w.error };
  try {
    await claimLicense(db(), w.user, text(fd, 'orgId', 64), text(fd, 'sessionId', 300), stripeLivemode());
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'License added.' };
}

export async function billingPortalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await writer(false);
  if ('error' in w) return { error: w.error };
  if (!limits.billing(w.user.id, Date.now())) return { error: 'Too many tries. Wait a few minutes.' };
  const orgId = text(fd, 'orgId', 64);
  const org = await getOrg(db(), w.user.id, orgId);
  if (!org) return { error: 'No such organization.' };
  if (org.role === 'member') return { error: 'Only owners and admins can see invoices and payment details.' };
  const result = await billingPortal(org.stripeCustomerId, consoleUrl('/billing'));
  if (!result.ok) {
    if (result.reason === 'no-customer') return { error: 'No invoices yet: this organization has no purchases with a Stripe customer.' };
    if (result.reason === 'not-available') return { error: 'Invoices and payment details are not available here yet. Email us for a copy of an invoice.' };
    return { error: "Couldn't open the billing page. Try again later." };
  }
  await audit(db(), { actor: w.user.id, action: 'billing.portal', orgId: org.id, targetType: 'organization', targetId: org.id }).catch(() => {});
  redirect(result.url);
}
