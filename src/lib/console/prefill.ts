/**
 * The Checkout Session fields for a console purchase. Pure, so it is tested.
 *
 * - With a Stripe customer: checkout uses it (the buyer sees their saved
 *   details, and the invoice lands on the same customer). Stripe then needs
 *   customer_update for the name and address it collects.
 * - Otherwise: the user's verified email is filled in, and a customer is made
 *   as for guests.
 * - Always: metadata org_id, so the license is issued into the organization.
 */
export type CheckoutPrefill = { orgId: string; customer: string | null; email: string | null };

export function checkoutCustomerParams(prefill: CheckoutPrefill | null): {
  customer?: string;
  customer_email?: string;
  customer_creation?: 'always';
  customer_update?: { name: 'auto'; address: 'auto' };
  metadata: Record<string, string>;
} {
  if (!prefill) return { customer_creation: 'always', metadata: {} };
  const metadata = { org_id: prefill.orgId };
  if (prefill.customer) return { customer: prefill.customer, customer_update: { name: 'auto', address: 'auto' }, metadata };
  return { customer_creation: 'always', ...(prefill.email ? { customer_email: prefill.email } : {}), metadata };
}
