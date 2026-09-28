import { CHECKOUT_SESSION_ID, emailHash } from '../license/format';
import { limits } from './limits';
import { EMAIL } from './orgs';

/**
 * "Go to your console" on the thanks page: a console sign-in link emailed to
 * the address used at checkout. The browser sends only the Checkout Session id;
 * the address comes from Stripe, so nobody can have a link sent to an address
 * of their choosing, and it never passes through the browser (only masked).
 *
 * The link itself is the console's own email sign-in (Auth.js, the same call
 * as the sign-in form), passed in as sendLink so this runs in tests.
 */

/** The Checkout Session fields used here (a Stripe.Checkout.Session fits). */
export type CheckoutSessionForSignIn = {
  status: string | null;
  payment_status: string;
  customer_details: { email: string | null } | null;
};

export type SessionReader = {
  checkout: { sessions: { retrieve(id: string): Promise<CheckoutSessionForSignIn> } };
};

export type ConsoleLinkState = { ok: true; sentTo: string } | { ok: false; error: string } | null;

const PAID = new Set(['paid', 'no_payment_required']);

export const LINK_ERRORS = {
  generic: "We couldn't send a sign-in link for this order. Sign in to the console with the email you paid with.",
  busy: 'Too many sign-in links for now. Wait 10 minutes and try again.',
  failed: "Couldn't send the sign-in email. Try again in a few minutes.",
} as const;

/** j•••@example.com: enough to recognise the address, not to learn it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

export async function sendCheckoutSignInLink(
  sessionId: unknown,
  deps: { stripe: SessionReader | null; ip: string; sendLink: (email: string) => Promise<void>; now?: number },
): Promise<ConsoleLinkState> {
  const now = deps.now ?? Date.now();
  if (typeof sessionId !== 'string' || !CHECKOUT_SESSION_ID.test(sessionId) || !deps.stripe) return { ok: false, error: LINK_ERRORS.generic };
  // Before asking Stripe: per IP, then per order.
  if (!limits.checkoutLinkIp(deps.ip, now) || !limits.checkoutLinkSession(sessionId, now)) return { ok: false, error: LINK_ERRORS.busy };

  let session: CheckoutSessionForSignIn;
  try {
    session = await deps.stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    // Unknown session, wrong mode, Stripe down: all the same answer.
    return { ok: false, error: LINK_ERRORS.generic };
  }
  if (session.status !== 'complete' || !PAID.has(session.payment_status)) return { ok: false, error: LINK_ERRORS.generic };
  const email = session.customer_details?.email?.trim().toLowerCase() ?? '';
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: LINK_ERRORS.generic };

  // The console form's per-address limit applies too. Over it nothing is sent,
  // and the answer is the same (as on the sign-in form).
  if (limits.signInEmail(emailHash(email), now)) {
    try {
      await deps.sendLink(email);
    } catch (err) {
      console.warn('[console] checkout sign-in link failed', err instanceof Error ? err.name : 'unknown error');
      return { ok: false, error: LINK_ERRORS.failed };
    }
  }
  return { ok: true, sentTo: maskEmail(email) };
}
