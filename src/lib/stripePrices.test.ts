import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_PACKS, periods } from '../components/pricing';
import { lookupKey } from './stripePacks';

// A fake Stripe client: prices.list answers from `stripeState`.
const stripeState = vi.hoisted(() => ({
  calls: [] as { lookup_keys: string[] }[],
  answer: 'valid' as 'valid' | 'invalid' | 'down',
}));

vi.mock('stripe', () => {
  class StripeError extends Error {}
  class FakeStripe {
    static errors = { StripeError };
    prices = {
      list: async (params: { lookup_keys: string[] }) => {
        stripeState.calls.push(params);
        if (stripeState.answer === 'down') throw new Error('network down');
        const data = FALLBACK_PACKS.flatMap((p) =>
          periods.map((period) => ({
            id: `price_${p.id}_${period}`,
            active: true,
            billing_scheme: 'per_unit',
            currency: stripeState.answer === 'invalid' ? 'usd' : 'eur',
            custom_unit_amount: null,
            lookup_key: lookupKey(p.id, period),
            recurring: null,
            tax_behavior: 'exclusive',
            transform_quantity: null,
            type: 'one_time',
            unit_amount: p.prices[period] + 100,
            product: { id: `prod_${p.id}`, active: true, metadata: { pack_id: p.id, max_servers: String(p.maxServers) } },
          })),
        ).filter((price) => params.lookup_keys.includes(price.lookup_key));
        return { data };
      },
    };
  }
  return { default: FakeStripe };
});

async function load() {
  vi.resetModules();
  return import('./stripePrices');
}

beforeEach(() => {
  stripeState.calls = [];
  stripeState.answer = 'valid';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fake');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getPacks', () => {
  it('uses the fallback, without calling Stripe, when no key is set', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const { getPacks } = await load();
    const r = await getPacks();
    expect(r.source).toBe('fallback');
    expect(r.packs).toEqual(FALLBACK_PACKS);
    expect(stripeState.calls).toHaveLength(0);
  });

  it('reads all 18 lookup keys in requests of at most 10, and uses Stripe amounts', async () => {
    const { getPacks } = await load();
    const r = await getPacks();
    expect(r.source).toBe('stripe');
    expect(stripeState.calls.map((c) => c.lookup_keys.length)).toEqual([10, 8]);
    expect(r.packs.find((p) => p.id === 'servers-l')?.prices.event).toBe(10000);
    if (r.source === 'stripe') expect(r.priceIds.servers_l_event).toBe('price_servers-l_event');
  });

  it('caches for 5 minutes', async () => {
    const { getPacks } = await load();
    await getPacks();
    await getPacks();
    expect(stripeState.calls).toHaveLength(2);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await getPacks();
    expect(stripeState.calls).toHaveLength(4);
  });

  it('keeps the last good prices when Stripe is down or the list turns invalid', async () => {
    const { getPacks } = await load();
    await getPacks();
    stripeState.answer = 'down';
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect((await getPacks()).source).toBe('stripe');
    stripeState.answer = 'invalid';
    vi.advanceTimersByTime(60_000 + 1);
    expect((await getPacks()).source).toBe('stripe');
  });

  it('falls back (so checkout is off) when Stripe has never given a valid list', async () => {
    stripeState.answer = 'invalid';
    const { getPacks } = await load();
    expect((await getPacks()).source).toBe('fallback');
    stripeState.answer = 'down';
    vi.advanceTimersByTime(60_000 + 1);
    expect((await getPacks()).source).toBe('fallback');
  });

  it('waits a minute after a failure before asking Stripe again', async () => {
    stripeState.answer = 'down';
    const { getPacks } = await load();
    await getPacks();
    const after = stripeState.calls.length;
    await getPacks();
    expect(stripeState.calls).toHaveLength(after);
    stripeState.answer = 'valid';
    vi.advanceTimersByTime(60_000 + 1);
    expect((await getPacks()).source).toBe('stripe');
  });

  it('invalidatePacks makes the next call read Stripe again', async () => {
    const { getPacks, invalidatePacks } = await load();
    await getPacks();
    invalidatePacks();
    await getPacks();
    expect(stripeState.calls).toHaveLength(4);
  });
});
