import { describe, expect, it, vi } from 'vitest';
import { stripePublishableKey } from './stripePublishable';

describe('stripePublishableKey', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('is null when unset or blank: hosted Checkout', () => {
    expect(stripePublishableKey({})).toBeNull();
    expect(stripePublishableKey({ STRIPE_PUBLISHABLE_KEY: '  ', STRIPE_SECRET_KEY: 'sk_live_x' })).toBeNull();
  });
  it('takes a publishable key in the same mode as the secret key', () => {
    expect(stripePublishableKey({ STRIPE_PUBLISHABLE_KEY: ' pk_live_abc123 ', STRIPE_SECRET_KEY: 'rk_live_x' })).toBe('pk_live_abc123');
    expect(stripePublishableKey({ STRIPE_PUBLISHABLE_KEY: 'pk_test_abc123', STRIPE_SECRET_KEY: 'sk_test_x' })).toBe('pk_test_abc123');
  });
  it('refuses a secret key or anything else put there by mistake', () => {
    expect(stripePublishableKey({ STRIPE_PUBLISHABLE_KEY: 'sk_live_abc123', STRIPE_SECRET_KEY: 'sk_live_x' })).toBeNull();
    expect(stripePublishableKey({ STRIPE_PUBLISHABLE_KEY: 'pk_live_abc"; alert(1)', STRIPE_SECRET_KEY: 'sk_live_x' })).toBeNull();
  });
  it('refuses a key in the other mode', () => {
    expect(stripePublishableKey({ STRIPE_PUBLISHABLE_KEY: 'pk_test_abc123', STRIPE_SECRET_KEY: 'sk_live_x' })).toBeNull();
    expect(stripePublishableKey({ STRIPE_PUBLISHABLE_KEY: 'pk_live_abc123', STRIPE_SECRET_KEY: 'rk_test_x' })).toBeNull();
  });
});
