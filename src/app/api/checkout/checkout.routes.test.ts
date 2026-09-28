import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_PACKS } from '@/components/pricing';
import { checkoutPeriods, invoiceFooter } from '@/lib/checkout';
import { lookupKey } from '@/lib/stripePacks';

// POST /api/checkout against a fake Stripe client: embedded when
// STRIPE_PUBLISHABLE_KEY is set, hosted (as before) when it isn't. Prices,
// validation and the founder cap are the same either way.

const create = vi.fn();

vi.mock('stripe', async (importOriginal) => {
  const actual = (await importOriginal()) as { default: { errors: unknown } };
  class FakeStripe {
    static errors = actual.default.errors;
    checkout = { sessions: { create } };
  }
  return { default: FakeStripe };
});

const priceIds = Object.fromEntries(
  FALLBACK_PACKS.flatMap((p) => checkoutPeriods.map((period) => [lookupKey(p.id, period), `price_${p.id}_${period}`])),
);
vi.mock('@/lib/stripePrices', () => ({
  getPacks: async () => ({ source: 'stripe', packs: FALLBACK_PACKS, priceIds }),
  invalidatePacks: vi.fn(),
}));
vi.mock('@/lib/license/store', () => ({ licenseStore: () => ({ founderCount: async () => 0 }) }));
vi.mock('@/lib/console/checkout', async () => {
  const prefill = await import('@/lib/console/prefill');
  return { consoleCheckoutPrefill: async () => null, checkoutCustomerParams: prefill.checkoutCustomerParams };
});

const { POST } = await import('./route');

let ip = 0;
function post(body: unknown) {
  ip++;
  return POST(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `203.0.113.${ip}` },
      body: JSON.stringify(body),
    }),
  );
}

const order = { pack: 'servers-m', period: 'year', servers: 20, tools: ['csm'], use: 'commercial' };

beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_routeTestKey');
  vi.stubEnv('SITE_URL', 'https://autotournament.gg');
  create.mockReset();
  create.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', client_secret: 'cs_test_1_secret_abc' });
});
afterEach(() => vi.unstubAllEnvs());

/** Every field but the return ones, which differ between embedded and hosted. */
const shared = {
  mode: 'payment',
  line_items: [{ price: 'price_servers-m_year', quantity: 1 }],
  customer_creation: 'always',
  billing_address_collection: 'required',
  tax_id_collection: { enabled: true },
  name_collection: { business: { enabled: true, optional: false } },
  consent_collection: { terms_of_service: 'required' },
  allow_promotion_codes: true,
};

describe('POST /api/checkout', () => {
  it('creates an Embedded Checkout session and answers the client secret when the publishable key is set', async () => {
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_test_routeTestKey');
    const res = await post(order);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSecret: 'cs_test_1_secret_abc' });
    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      ...shared,
      ui_mode: 'embedded_page',
      return_url: 'https://autotournament.gg/pricing/thanks?session_id={CHECKOUT_SESSION_ID}',
    });
    expect(params).not.toHaveProperty('success_url');
    expect(params).not.toHaveProperty('cancel_url');
    expect(params.custom_fields.map((f: { key: string }) => f.key)).toEqual(['buyertype', 'eventdates', 'eventname']);
    expect(params.metadata).toEqual({ pack: 'servers-m', period: 'year', servers: '20', tools: 'csm', max_servers: '20' });
    expect(params.invoice_creation.invoice_data.footer).toBe(invoiceFooter);
    expect(params.payment_intent_data.metadata).toEqual(params.metadata);
  });

  it('falls back to hosted Checkout (a redirect url) without the publishable key, as before', async () => {
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', '');
    const res = await post(order);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      ...shared,
      success_url: 'https://autotournament.gg/pricing/thanks?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://autotournament.gg/pricing#guide',
    });
    expect(params).not.toHaveProperty('ui_mode');
    expect(params).not.toHaveProperty('return_url');
  });

  it('uses hosted Checkout when the publishable key is in the other mode than the secret key', async () => {
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_live_otherMode');
    const res = await post(order);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  });

  it('answers 502 when Stripe returns an embedded session without a client secret', async () => {
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_test_routeTestKey');
    create.mockResolvedValue({ id: 'cs_test_2', url: null, client_secret: null });
    expect((await post(order)).status).toBe(502);
  });

  it('still answers 503 without the secret key, and never calls Stripe', async () => {
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_test_routeTestKey');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect((await post(order)).status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it('still validates the order before anything else', async () => {
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_test_routeTestKey');
    expect((await post({ ...order, pack: 'servers-s' })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
