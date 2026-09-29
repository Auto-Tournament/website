import 'server-only';
import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db/client';
import { sameOrigin } from '@/lib/site';
import { consoleEnabled } from './auth';
import { canManage, getOrg, verifiedEmail } from './orgs';
import { currentUser, orgCookieName } from './session';
import { stripeLivemode } from '@/lib/stripeMode';
import { checkoutCustomerParams, type CheckoutPrefill } from './prefill';
import { consoleOrigin } from './urls';
import { isStaff } from './roles';

export { checkoutCustomerParams, type CheckoutPrefill };

/**
 * When checkout is started from the console (the Buy page, on the console's
 * host, with the session cookie), who is buying: the current organization,
 * its Stripe customer (when it has one in the key's mode and the user is an
 * owner or admin) or else the user's verified email. Null for guests: then checkout is exactly as before.
 */
export async function consoleCheckoutPrefill(): Promise<CheckoutPrefill | null> {
  if (!consoleEnabled()) return null;
  try {
    const h = (await headers()) as unknown as Headers;
    if (!sameOrigin(h, consoleOrigin())) return null;
    const user = await currentUser();
    if (!user) return null;
    const orgId = (await cookies()).get(orgCookieName())?.value;
    const org = orgId ? await getOrg(db(), user.id, orgId) : null;
    // A server provider doesn't buy for the organization: checkout is as for a guest.
    if (!org || !isStaff(org.role)) return null;
    // The org's Stripe customer (its saved billing details) only for owners and admins, like the billing page.
    const customer = org.stripeCustomerId && stripeLivemode() && canManage(org.role) ? org.stripeCustomerId : null;
    return { orgId: org.id, customer, email: customer ? null : verifiedEmail(user) };
  } catch (err) {
    console.error('[checkout] console prefill failed; continuing as a guest', err instanceof Error ? err.name : 'unknown error');
    return null;
  }
}
