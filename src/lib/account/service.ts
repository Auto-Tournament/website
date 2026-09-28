import 'server-only';
import { cookies } from 'next/headers';
import { emailConfig, sendEmail } from '@/lib/email/postmark';
import { licenseDataDir, licenseStore, type LicenseStore } from '@/lib/license/store';
import { siteUrl } from '@/lib/site';
import { signInEmail } from './email';
import { accountSecret, SESSION_COOKIE, verifySession } from './session';
import { createAccountStore, type AccountStore } from './store';

/**
 * /account: sign in by email link, then see every license bought with that
 * email. On only when both ACCOUNT_SESSION_SECRET (at least 32 characters)
 * and POSTMARK_SERVER_TOKEN are set; otherwise the page says sign-in isn't
 * available and the routes answer 404.
 */

export function accountEnabled(): boolean {
  return accountSecret() !== null && emailConfig() !== null;
}

let shared: AccountStore | null = null;

export function accountStore(): AccountStore {
  shared ??= createAccountStore(licenseDataDir());
  return shared;
}

/** The signed-in buyer's email hash, from the session cookie, or null. */
export async function currentAccount(): Promise<{ sessionId: string; emailSha256: string } | null> {
  const secret = accountSecret();
  if (!secret || !emailConfig()) return null;
  const sessionId = verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret);
  if (!sessionId) return null;
  try {
    const emailSha256 = await accountStore().session(sessionId);
    return emailSha256 ? { sessionId, emailSha256 } : null;
  } catch (err) {
    console.error('[account] could not read the session', err instanceof Error ? err.message : 'unknown error');
    return null;
  }
}

/**
 * Emails a sign-in link to `email` when at least one license was bought with
 * it; otherwise does nothing. Never throws, never logs the address. Runs after
 * the response, so the answer and its timing are the same either way.
 */
export async function sendSignInLink(
  email: string,
  emailSha256: string,
  deps: { licenses?: LicenseStore; accounts?: AccountStore; fetchImpl?: typeof fetch } = {},
): Promise<'sent' | 'no-license' | 'failed' | 'disabled'> {
  const config = emailConfig();
  const site = siteUrl();
  if (!config || !site || !accountSecret()) return 'disabled';
  try {
    const licenses = await (deps.licenses ?? licenseStore()).forEmail(emailSha256);
    if (licenses.length === 0) return 'no-license';
    const token = await (deps.accounts ?? accountStore()).createToken(emailSha256);
    const link = `${site}/account/signin?token=${token}`;
    const result = await sendEmail({ to: email, ...signInEmail(link), tag: 'account-signin' }, config, deps.fetchImpl);
    if (result.ok) return 'sent';
    console.error('[account] sign-in email failed', { error: result.error });
    return 'failed';
  } catch (err) {
    console.error('[account] sign-in email failed', err instanceof Error ? err.message : 'unknown error');
    return 'failed';
  }
}
