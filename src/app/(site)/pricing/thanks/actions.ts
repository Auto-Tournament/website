'use server';

import { headers } from 'next/headers';
import { clientIp } from '@/lib/checkout';
import { stripeServer } from '@/lib/license/issue';
import { sameOrigin } from '@/lib/site';
import { signIn } from '@/lib/console/auth';
import { LINK_ERRORS, sendCheckoutSignInLink, type ConsoleLinkState } from '@/lib/console/checkoutSignIn';
import { consoleUrl } from '@/lib/console/urls';
import { consoleLinkAvailable } from './available';

/**
 * "Go to your console": emails a console sign-in link to the address used at
 * checkout. The form sends only session_id; the address comes from Stripe
 * (src/lib/console/checkoutSignIn.ts).
 */
export async function sendConsoleLinkAction(_prev: ConsoleLinkState, fd: FormData): Promise<ConsoleLinkState> {
  if (!consoleLinkAvailable()) return { ok: false, error: LINK_ERRORS.generic };
  const h = (await headers()) as unknown as Headers;
  if (!sameOrigin(h)) return { ok: false, error: 'Forbidden.' };
  return sendCheckoutSignInLink(fd.get('session_id'), {
    stripe: stripeServer(),
    ip: clientIp(h),
    // The console sign-in form's own call: same link, expiry and email.
    sendLink: async (email) => {
      await signIn('email', { email, redirectTo: consoleUrl('/'), redirect: false });
    },
  });
}
