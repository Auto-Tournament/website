/** Whether the site's Stripe key is a live one (not sk_test_/rk_test_). No key: live, as in production. */
export function stripeLivemode(key: string | undefined = process.env.STRIPE_SECRET_KEY): boolean {
  return !/^(?:sk|rk)_test_/.test(key?.trim() ?? '');
}
