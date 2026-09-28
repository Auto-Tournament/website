// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CheckoutProvider, useCheckout, type BuyOutcome, type CheckoutOrder } from './Checkout';

// The dialog with a mocked Stripe.js loader and a mocked custom-checkout
// session (@stripe/react-stripe-js/checkout): no network, no real Stripe.

const fakeStripe = { elements: () => undefined };
const loadStripe = vi.fn(async (_key: string) => fakeStripe as unknown);
vi.mock('@stripe/stripe-js/pure', () => ({ loadStripe: (key: string) => loadStripe(key) }));

type Result = { type: 'success'; session: unknown } | { type: 'error'; error: { message: string; code?: string | null } };
const ok: Result = { type: 'success', session: {} };
const session = {
  id: 'cs_test_1abcdefghijk',
  currency: 'eur',
  email: null as string | null,
  discountAmounts: null,
  total: { subtotal: { minorUnitsAmount: 49900 }, discount: { minorUnitsAmount: 0 }, total: { minorUnitsAmount: 49900 } },
};
const actions = {
  applyPromotionCode: vi.fn(async (_code: string): Promise<Result> => ok),
  removePromotionCode: vi.fn(async (): Promise<Result> => ok),
  updateTaxIdInfo: vi.fn(async (_info: unknown): Promise<Result> => ok),
  runServerUpdate: vi.fn(async (fn: () => Promise<unknown>): Promise<Result> => {
    try {
      await fn();
      return ok;
    } catch {
      return { type: 'error', error: { message: 'server update failed' } };
    }
  }),
  confirm: vi.fn(async (_args: unknown): Promise<Result> => ok),
};
let checkoutState: { type: 'loading' } | { type: 'error'; error: { message: string } } | { type: 'success'; checkout: unknown } = { type: 'loading' };
const providerOptions = vi.fn();
vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ children, options }: { children: unknown; options: unknown }) => {
    providerOptions(options);
    return children;
  },
  useCheckoutElements: () => checkoutState,
  PaymentElement: () => <div data-testid="payment-element" />,
}));

const order: CheckoutOrder = {
  payload: { pack: 'platform-m', period: 'year', servers: 20, tools: ['platform'], use: 'commercial' },
  packName: 'Platform M',
  maxServers: 20,
  period: 'year',
  price: 49900,
};

let outcome: BuyOutcome | null = null;
function BuyButton() {
  const { buy } = useCheckout();
  return (
    <button
      type="button"
      onClick={async () => {
        outcome = await buy(order);
      }}
    >
      Buy
    </button>
  );
}

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const assign = vi.fn();
beforeEach(() => {
  outcome = null;
  checkoutState = { type: 'success', checkout: { ...session, ...actions } };
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('CheckoutProvider with a publishable key (Embedded Checkout)', () => {
  it('opens the dialog with the pack, period and price, and mounts Stripe with the client secret', async () => {
    const fetchMock = answer(200, { clientSecret: 'cs_test_1_secret_x' });
    render(
      <CheckoutProvider publishableKey="pk_test_unit">
        <BuyButton />
      </CheckoutProvider>,
    );
    fireEvent.click(screen.getByText('Buy'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Platform M license');
    expect(screen.getByTestId('checkout-summary').textContent).toContain('Yearly');
    expect(dialog.textContent).toContain('€499');

    // Our form, on Stripe's session numbers, with the Payment Element inside it.
    await screen.findByTestId('checkout-form');
    expect(loadStripe).toHaveBeenCalledWith('pk_test_unit');
    expect(providerOptions).toHaveBeenCalledWith(expect.objectContaining({ clientSecret: 'cs_test_1_secret_x', elementsOptions: expect.objectContaining({ appearance: expect.objectContaining({ theme: 'night' }) }) }));
    expect(screen.getByTestId('payment-element')).toBeTruthy();
    expect(screen.getByTestId('checkout-order').textContent).toContain('up to 20 servers');
    expect(screen.getByTestId('checkout-total').textContent).toBe('€499');
    expect(screen.getByTestId('checkout-pay').textContent).toBe('Pay €499');
    expect(fetchMock).toHaveBeenCalledWith('/api/checkout', expect.objectContaining({ method: 'POST', body: JSON.stringify(order.payload) }));
    expect(outcome).toEqual({ kind: 'opened' });

    fireEvent.click(screen.getByRole('button', { name: 'Close checkout' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows "card payment is off" in the dialog on 503, with the email request', async () => {
    answer(503, { error: 'off' });
    render(
      <CheckoutProvider publishableKey="pk_test_unit">
        <BuyButton />
      </CheckoutProvider>,
    );
    fireEvent.click(screen.getByText('Buy'));
    const alert = await screen.findByTestId('checkout-error');
    expect(alert.dataset.reason).toBe('cardOff');
    expect(alert.textContent).toContain('Card payment is off right now');
    expect(screen.getByRole('link', { name: 'Request by email' }).getAttribute('href')).toMatch(/^mailto:/);
    expect(outcome).toMatchObject({ kind: 'failed', cardOff: true, shownInDialog: true });
    expect(providerOptions).not.toHaveBeenCalled();
  });

  it('says so when Stripe.js could not load (blocked), instead of spinning forever', async () => {
    answer(200, { clientSecret: 'cs_test_1_secret_x' });
    loadStripe.mockResolvedValueOnce(null);
    render(
      <CheckoutProvider publishableKey="pk_test_blocked">
        <BuyButton />
      </CheckoutProvider>,
    );
    fireEvent.click(screen.getByText('Buy'));
    expect((await screen.findByTestId('checkout-error')).dataset.reason).toBe('blocked');
  });
});

describe('without a publishable key (hosted fallback, as before)', () => {
  it('goes to the Stripe url and opens no dialog', async () => {
    answer(200, { url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    render(
      <CheckoutProvider publishableKey={null}>
        <BuyButton />
      </CheckoutProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Buy'));
    });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1'));
    expect(outcome).toEqual({ kind: 'redirecting' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it('returns the error for the button to show inline', async () => {
    answer(503, {});
    render(<BuyButton />);
    await act(async () => {
      fireEvent.click(screen.getByText('Buy'));
    });
    await waitFor(() => expect(outcome).toMatchObject({ kind: 'failed', cardOff: true, shownInDialog: false }));
  });
});

/* ------------------------------------------------------- our custom form */

async function openForm(fetchMock = answer(200, { clientSecret: 'cs_test_1_secret_x' })) {
  render(
    <CheckoutProvider publishableKey="pk_test_unit">
      <BuyButton />
    </CheckoutProvider>,
  );
  fireEvent.click(screen.getByText('Buy'));
  await screen.findByTestId('checkout-form');
  return fetchMock;
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillValid({ vat = '' }: { vat?: string } = {}) {
  type('Email', 'buyer@example.com');
  type('Company or organization', 'Example LAN AS');
  type('VAT ID (optional)', vat);
  type('Event or client name, and website', 'Example LAN, examplelan.no');
  type('Event date(s)', '3-5 October 2026');
  type('Street address', 'Storgata 1');
  type('Postal code', '2815');
  type('City', 'Gjøvik');
  fireEvent.click(screen.getByLabelText(/buying for a business/));
  fireEvent.click(screen.getByLabelText(/I accept the/));
}

describe('custom checkout form', () => {
  it('shows inline errors for every missing field and sends nothing to Stripe', async () => {
    await openForm();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    expect((await screen.findByTestId('checkout-form-error')).textContent).toContain('Check the highlighted fields');
    const form = screen.getByTestId('checkout-form').textContent ?? '';
    for (const msg of ['Enter the email address', 'Enter the company', 'Enter the event or client name', 'Enter the event date', 'Enter the street address', 'Enter the postal code', 'Enter the city', 'Confirm that you are buying for a business', 'Accept the terms']) {
      expect(form).toContain(msg);
    }
    expect(screen.getByLabelText('Company or organization').getAttribute('aria-invalid')).toBe('true');
    expect(actions.confirm).not.toHaveBeenCalled();
    expect(actions.runServerUpdate).not.toHaveBeenCalled();
  });

  it('links both terms documents in a new tab', async () => {
    await openForm();
    const terms = screen.getByRole('link', { name: /Commercial License Terms/ });
    const sale = screen.getByRole('link', { name: /Terms of Sale/ });
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(sale.getAttribute('href')).toBe('/terms-of-sale');
    for (const a of [terms, sale]) expect(a.getAttribute('target')).toBe('_blank');
  });

  it('pays: VAT ID to Stripe as a tax ID, our fields to /api/checkout/details, then confirm with email and billing address', async () => {
    const fetchMock = await openForm();
    fillValid({ vat: '123 456 789' });
    fireEvent.click(screen.getByTestId('checkout-pay'));

    await waitFor(() => expect(actions.confirm).toHaveBeenCalled());
    expect(actions.updateTaxIdInfo).toHaveBeenCalledWith({ businessName: 'Example LAN AS', taxId: { type: 'no_vat', value: '123456789MVA' } });
    const details = fetchMock.mock.calls.find(([url]) => url === '/api/checkout/details');
    expect(details).toBeDefined();
    expect(JSON.parse(String(details?.[1]?.body))).toEqual({
      sessionId: 'cs_test_1abcdefghijk',
      company: 'Example LAN AS',
      eventName: 'Example LAN, examplelan.no',
      eventDates: '3-5 October 2026',
      vatId: '123 456 789',
      business: true,
      terms: true,
    });
    expect(actions.confirm).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      billingAddress: { name: 'Example LAN AS', address: { country: 'NO', line1: 'Storgata 1', line2: null, postal_code: '2815', city: 'Gjøvik' } },
    });
    // Processing: the button stays busy while Stripe leaves for the thanks page.
    expect(screen.getByTestId('checkout-pay').textContent).toContain('Processing');
  });

  it('shows a declined card as a form error and lets the buyer try again', async () => {
    await openForm();
    actions.confirm.mockResolvedValueOnce({ type: 'error', error: { message: 'Your card was declined.', code: 'paymentFailed' } });
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    expect((await screen.findByTestId('checkout-form-error')).textContent).toContain('Your card was declined.');
    expect(actions.updateTaxIdInfo).not.toHaveBeenCalled();
    expect(screen.getByTestId('checkout-pay').textContent).toBe('Pay €499');
  });

  it('puts a rejected VAT ID under the VAT field and does not confirm', async () => {
    await openForm();
    actions.updateTaxIdInfo.mockResolvedValueOnce({ type: 'error', error: { message: 'bad', code: 'invalidTaxId' } });
    fillValid({ vat: 'DE123' });
    type('VAT ID (optional)', 'DE123');
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'DE' } });
    fireEvent.click(screen.getByTestId('checkout-pay'));
    await waitFor(() => expect(screen.getByLabelText('VAT ID (optional)').getAttribute('aria-invalid')).toBe('true'));
    expect(actions.confirm).not.toHaveBeenCalled();
  });

  it('does not confirm when the details could not be saved', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/checkout/details'
        ? new Response(JSON.stringify({ error: 'This checkout has ended. Close it and start again.' }), { status: 409 })
        : new Response(JSON.stringify({ clientSecret: 'cs_test_1_secret_x' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await openForm(fetchMock as never);
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    expect((await screen.findByTestId('checkout-form-error')).textContent).toContain('This checkout has ended');
    expect(actions.confirm).not.toHaveBeenCalled();
  });

  it('at a total of 0 (full promo) hides the Payment Element and confirms without a payment method', async () => {
    checkoutState = { type: 'success', checkout: { ...session, total: { subtotal: { minorUnitsAmount: 49900 }, discount: { minorUnitsAmount: 49900 }, total: { minorUnitsAmount: 0 } }, ...actions } };
    const fetchMock = await openForm();
    expect(screen.queryByTestId('payment-element')).toBeNull();
    expect(screen.getByTestId('checkout-free').textContent).toBe('Nothing to pay: your promo code covers the full price.');
    expect(screen.getByTestId('checkout-pay').textContent).toBe('Get my license');
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    await waitFor(() => expect(actions.confirm).toHaveBeenCalled());
    expect(actions.runServerUpdate).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/checkout/details')).toBe(true);
    expect(actions.confirm.mock.calls[0][0]).not.toHaveProperty('paymentMethod');
  });

  it('with a nonzero total shows the Payment Element and the price on the button', async () => {
    await openForm();
    expect(screen.getByTestId('payment-element')).toBeTruthy();
    expect(screen.queryByTestId('checkout-free')).toBeNull();
    expect(screen.getByTestId('checkout-pay').textContent).toBe('Pay €499');
  });

  it('applies a promo code through Stripe and shows an error when it is refused', async () => {
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add a promo code' }));
    actions.applyPromotionCode.mockResolvedValueOnce({ type: 'error', error: { message: 'This code is invalid.' } });
    type('Promo code', 'nope');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('This code is invalid.')).toBeTruthy();
    expect(actions.applyPromotionCode).toHaveBeenCalledWith('nope');
  });

  it('falls back to hosted Checkout when the custom session will not start', async () => {
    checkoutState = { type: 'error', error: { message: 'init failed' } };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/checkout?mode=hosted'
        ? new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_2' }), { status: 200 })
        : new Response(JSON.stringify({ clientSecret: 'cs_test_1_secret_x' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <CheckoutProvider publishableKey="pk_test_unit">
        <BuyButton />
      </CheckoutProvider>,
    );
    fireEvent.click(screen.getByText('Buy'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_2'));
    expect(fetchMock).toHaveBeenCalledWith('/api/checkout?mode=hosted', expect.objectContaining({ body: JSON.stringify(order.payload) }));
  });
});
