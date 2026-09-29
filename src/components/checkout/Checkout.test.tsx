// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { StripeCheckoutAmount, StripeCheckoutTotalSummary } from '@stripe/stripe-js';
import { CheckoutProvider, useCheckout, type BuyOutcome, type CheckoutOrder } from './Checkout';
import { isFreeOrder, summaryOf, type SummarySession } from './StripeCheckoutForm';
import { formatMoney } from './CheckoutForm';

// The dialog with a mocked Stripe.js loader and a mocked custom-checkout
// session (@stripe/react-stripe-js/checkout): no network, no real Stripe.

const fakeStripe = { elements: () => undefined };
const loadStripe = vi.fn(async (_key: string) => fakeStripe as unknown);
vi.mock('@stripe/stripe-js/pure', () => ({ loadStripe: (key: string) => loadStripe(key) }));

type Result = { type: 'success'; session: unknown } | { type: 'error'; error: { message: string; code?: string | null } };
const ok: Result = { type: 'success', session: {} };
// Amounts in the real SDK shape (StripeCheckoutAmount / StripeCheckoutTotalSummary).
const amt = (minorUnitsAmount: number): StripeCheckoutAmount => ({ minorUnitsAmount, amount: `€${(minorUnitsAmount / 100).toFixed(2)}` });
function totals(subtotal: number, discount: number): StripeCheckoutTotalSummary {
  return {
    appliedBalance: amt(0),
    balanceAppliedToNextInvoice: false,
    discount: amt(discount),
    shippingRate: amt(0),
    subtotal: amt(subtotal),
    surcharge: amt(0),
    taxExclusive: amt(0),
    taxInclusive: amt(0),
    total: amt(subtotal - discount),
  };
}
const session: SummarySession = {
  id: 'cs_test_1abcdefghijk',
  currency: 'eur',
  email: null,
  discountAmounts: null,
  total: totals(49900, 0),
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
  updateBillingAddress: vi.fn(async (_address: unknown): Promise<Result> => ok),
  confirm: vi.fn(async (args: unknown): Promise<Result> => {
    requirePaymentElement();
    // Stripe.js with automatic tax: the address goes through updateBillingAddress, never confirm().
    if (args && typeof args === 'object' && 'billingAddress' in args) {
      throw new IntegrationError('You cannot provide `billingAddress` in confirm() when using automatic tax. Please use updateBillingAddress() instead.');
    }
    return ok;
  }),
};

// Stripe.js in a payment-mode session (payment_method_collection `always`,
// the only value payment mode allows): confirm() goes through the Payment
// Element at every total, €0 included, and throws an IntegrationError when
// none is mounted.
class IntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationError';
  }
}
let paymentElementsMounted = 0;
function requirePaymentElement() {
  if (paymentElementsMounted < 1) throw new IntegrationError('Please ensure that the Payment Element is mounted and the ready event has been emitted before calling confirm().');
}
function MockPaymentElement() {
  useEffect(() => {
    paymentElementsMounted += 1;
    return () => {
      paymentElementsMounted -= 1;
    };
  }, []);
  return <div data-testid="payment-element" />;
}
let checkoutState: { type: 'loading' } | { type: 'error'; error: { message: string } } | { type: 'success'; checkout: unknown } = { type: 'loading' };
const providerOptions = vi.fn();
vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ children, options }: { children: unknown; options: unknown }) => {
    providerOptions(options);
    return children;
  },
  useCheckoutElements: () => checkoutState,
  PaymentElement: () => <MockPaymentElement />,
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
    expect(screen.getByTestId('checkout-order').textContent).toContain('Up to 20 servers');
    expect(screen.getByTestId('checkout-total').textContent).toBe('€499.00');
    expect(screen.getByTestId('checkout-pay').textContent).toBe('Pay €499.00');
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
// The date picker: its label names both the spinbutton group and its hidden input, which takes a typed date.
const setStart = (value: string) => fireEvent.change(screen.getByLabelText('From when should the license be valid?', { selector: 'input' }), { target: { value } });

function fillValid({ vat = '' }: { vat?: string } = {}) {
  type('Your name', 'Kari Nordmann');
  type('Email', 'buyer@example.com');
  type('Company or organization', 'Example LAN AS');
  type('VAT ID (optional)', vat);
  type('What will you use it for? (optional)', 'Example LAN, examplelan.no');
  setStart('03/10/2030');
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'NO' } });
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
    const errorSummary = await screen.findByTestId('checkout-error-summary');
    expect(errorSummary.textContent).toContain('9 fields need attention');
    await waitFor(() => expect(document.activeElement).toBe(errorSummary));
    // Each entry links to its field and moves focus there.
    const link = screen.getByRole('link', { name: /^Company or organization:/ });
    fireEvent.click(link);
    expect(document.activeElement).toBe(screen.getByLabelText('Company or organization'));
    expect(screen.getByTestId('checkout-pay').hasAttribute('disabled')).toBe(false);
    const form = screen.getByTestId('checkout-form').textContent ?? '';
    for (const msg of ['Enter your name', 'Enter the email address', 'Enter the company', 'Choose the date the license starts', 'Enter the street address', 'Enter the postal code', 'Enter the city', 'Confirm that you are buying for a business', 'Accept the terms']) {
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

  it('pays: VAT ID to Stripe as a tax ID, our fields to /api/checkout/details, the billing address to the session, then confirm with the email', async () => {
    const fetchMock = await openForm();
    fillValid({ vat: '123 456 789' });
    fireEvent.click(screen.getByTestId('checkout-pay'));

    await waitFor(() => expect(actions.confirm).toHaveBeenCalled());
    expect(actions.updateTaxIdInfo).toHaveBeenCalledWith({ businessName: 'Example LAN AS', taxId: { type: 'no_vat', value: '123456789MVA' } });
    const details = fetchMock.mock.calls.find(([url]) => url === '/api/checkout/details');
    expect(details).toBeDefined();
    expect(JSON.parse(String(details?.[1]?.body))).toEqual({
      sessionId: 'cs_test_1abcdefghijk',
      buyerName: 'Kari Nordmann',
      company: 'Example LAN AS',
      eventName: 'Example LAN, examplelan.no',
      eventDates: '2030-10-03',
      vatId: '123 456 789',
      business: true,
      terms: true,
    });
    expect(actions.updateBillingAddress).toHaveBeenCalledWith({ name: 'Example LAN AS', address: { country: 'NO', line1: 'Storgata 1', line2: null, postal_code: '2815', city: 'Gjøvik' } });
    expect(actions.updateBillingAddress.mock.invocationCallOrder[0]).toBeLessThan(actions.confirm.mock.invocationCallOrder[0]);
    expect(actions.confirm).toHaveBeenCalledWith({ email: 'buyer@example.com' });
    await waitFor(() => expect(actions.confirm.mock.results[0]?.type).toBe('return'));
    await expect(actions.confirm.mock.results[0].value).resolves.toEqual(ok);
    // Processing: the button stays busy while Stripe leaves for the thanks page.
    expect(screen.getByTestId('checkout-pay').textContent).toContain('Processing');
  });

  it('shows a rejected billing address as a form error and does not confirm', async () => {
    await openForm();
    actions.updateBillingAddress.mockResolvedValueOnce({ type: 'error', error: { message: 'Enter a valid postal code.' } });
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    expect((await screen.findByTestId('checkout-form-error')).textContent).toContain('Enter a valid postal code.');
    expect(actions.confirm).not.toHaveBeenCalled();
  });

  it('start date: a date picker with a live validity line; past days are refused', async () => {
    await openForm();
    expect(screen.queryByTestId('checkout-validity')).toBeNull();
    setStart('03/10/2030');
    expect(screen.getByTestId('checkout-validity').textContent).toBe('Valid 3 October 2030 – 2 October 2031');
    // Keyboard and screen readers: day, month and year spinbuttons in a group named by our label.
    const group = screen.getByRole('group', { name: 'From when should the license be valid?' });
    expect(group.querySelectorAll('[role="spinbutton"]').length).toBe(3);
    expect(screen.getByRole('button', { name: /calendar/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Choose your country' })).toBeTruthy();
    setStart('01/01/2020');
    fireEvent.click(screen.getByTestId('checkout-pay'));
    expect((await screen.findByTestId('checkout-error-summary')).textContent).toMatch(/License start date: (Choose today or a later date|Enter a date)/);
  });

  it('shows a declined card as a form error and lets the buyer try again', async () => {
    await openForm();
    actions.confirm.mockResolvedValueOnce({ type: 'error', error: { message: 'Your card was declined.', code: 'paymentFailed' } });
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    expect((await screen.findByTestId('checkout-form-error')).textContent).toContain('Your card was declined.');
    expect(actions.updateTaxIdInfo).not.toHaveBeenCalled();
    expect(screen.getByTestId('checkout-pay').textContent).toBe('Pay €499.00');
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

  it('at a total of 0 (full promo) keeps the Payment Element mounted, so confirm() does not throw', async () => {
    const discounted: SummarySession = {
      ...session,
      total: totals(49900, 49900),
      discountAmounts: [{ ...amt(49900), displayName: '100% off', promotionCode: 'FREE100', recurring: null, percentOff: 100 }],
    };
    checkoutState = { type: 'success', checkout: { ...discounted, ...actions } };
    const fetchMock = await openForm();
    expect(screen.getByTestId('payment-element')).toBeTruthy();
    expect(screen.getByTestId('checkout-free').textContent).toContain('Nothing to pay: your promo code covers the full price.');
    expect(screen.getByTestId('checkout-pay').textContent).toBe('Get my license');
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    await waitFor(() => expect(actions.confirm).toHaveBeenCalled());
    expect(actions.runServerUpdate).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/checkout/details')).toBe(true);
    expect(actions.confirm.mock.calls[0][0]).not.toHaveProperty('paymentMethod');
    await waitFor(() => expect(actions.confirm.mock.results[0]?.type).toBe('return'));
    await expect(actions.confirm.mock.results[0].value).resolves.toEqual(ok);
    expect(screen.queryByTestId('checkout-form-error')).toBeNull();
  });

  it('logs the IntegrationError message when confirm() throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const message = 'Please ensure that the Payment Element is mounted and the ready event has been emitted before calling confirm().';
    actions.confirm.mockImplementationOnce(async () => {
      throw new IntegrationError(message);
    });
    await openForm();
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    expect((await screen.findByTestId('checkout-form-error')).textContent).toContain('Nothing was charged');
    expect(log).toHaveBeenCalledWith('[checkout] pay step failed', { step: 'confirm', error: 'IntegrationError', message });
    log.mockRestore();
  });

  // A free session the way Stripe.js behaves: confirm() throws unless the page
  // read total.total.amount, and on success it leaves for the session's return_url.
  function freeSession(confirm: (args: unknown) => Promise<Result>) {
    const discounted: SummarySession = {
      ...session,
      total: totals(49900, 49900),
      discountAmounts: [{ ...amt(49900), displayName: '100% off', promotionCode: 'FREE100', recurring: null, percentOff: 100 }],
    };
    let amountRead = false;
    const total = { ...discounted.total.total };
    Object.defineProperty(total, 'amount', { enumerable: true, get: () => ((amountRead = true), '€0.00') });
    const withGetter = { ...discounted, total: { ...discounted.total, total } };
    actions.confirm.mockImplementationOnce(async (args: unknown) => {
      if (!amountRead) throw new IntegrationError("checkout.confirm() - You must read the session's total amount before calling confirm().");
      requirePaymentElement();
      return confirm(args);
    });
    checkoutState = { type: 'success', checkout: { ...withGetter, ...actions } };
  }

  it('at 0: confirm resolves and Stripe.js leaves for the return_url; the button stays busy', async () => {
    freeSession(async () => {
      window.location.assign('/thanks?session_id=cs_test_1abcdefghijk');
      return ok;
    });
    await openForm();
    expect(screen.getByTestId('checkout-total').textContent).toContain('€0.00');
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/thanks?session_id=cs_test_1abcdefghijk'));
    expect(screen.queryByTestId('checkout-form-error')).toBeNull();
    expect(screen.getByTestId('checkout-pay').textContent).toContain('Processing');
  });

  it('at 0: a confirm that never settles shows an error after 20 s, never an endless spinner', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    freeSession(() => new Promise<Result>(() => {}));
    await openForm();
    fillValid();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(screen.getByTestId('checkout-pay'));
      await waitFor(() => expect(actions.confirm).toHaveBeenCalled());
      expect(screen.getByTestId('checkout-pay').textContent).toContain('Processing');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect((await screen.findByTestId('checkout-form-error')).textContent).toContain('Something went wrong. Nothing was charged. Try again or contact us.');
      expect(screen.getByTestId('checkout-pay').textContent).toBe('Get my license');
      expect(log).toHaveBeenCalledWith('[checkout] pay step failed', { step: 'confirm', error: 'StepTimeout', message: 'confirm timed out' });
    } finally {
      vi.useRealTimers();
      log.mockRestore();
    }
  });

  it('a step that throws shows an error instead of spinning', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    actions.runServerUpdate.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await openForm();
    fillValid();
    fireEvent.click(screen.getByTestId('checkout-pay'));
    expect((await screen.findByTestId('checkout-form-error')).textContent).toContain('Nothing was charged');
    expect(actions.confirm).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('checks a field when the buyer leaves it, not before', async () => {
    await openForm();
    const email = screen.getByLabelText('Email');
    fireEvent.blur(email);
    expect(email.getAttribute('aria-invalid')).toBe('false');
    type('Email', 'not-an-email');
    fireEvent.blur(email);
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter the email address the license and invoice go to.').closest('[id]')?.id).toBe(email.getAttribute('aria-describedby')?.split(' ')[0]);
  });

  it('with a nonzero total shows the Payment Element and the price on the button', async () => {
    await openForm();
    expect(screen.getByTestId('payment-element')).toBeTruthy();
    expect(screen.queryByTestId('checkout-free')).toBeNull();
    expect(screen.getByTestId('checkout-pay').textContent).toBe('Pay €499.00');
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

describe('free order detection on the real session shape', () => {
  it('reads total.total (after discounts) from StripeCheckoutTotalSummary', () => {
    expect(isFreeOrder({ total: totals(49900, 49900) })).toBe(true);
    expect(isFreeOrder({ total: totals(49900, 4990) })).toBe(false);
    const s = summaryOf({ ...session, total: totals(49900, 49900) });
    expect(s).toMatchObject({ subtotal: 49900, discount: 49900, total: 0, free: true });
  });

  it('still sees a free order when the minor units cross the iframe as a string', () => {
    const t = totals(49900, 49900);
    const stringy = { ...t, total: { ...t.total, minorUnitsAmount: '0' as unknown as number } };
    expect(isFreeOrder({ total: stringy })).toBe(true);
    const missing = { ...t, total: { amount: '€0.00' } as unknown as StripeCheckoutAmount };
    expect(isFreeOrder({ total: missing })).toBe(true);
  });

  it('never shows a sub-euro amount as "€0"', () => {
    expect(formatMoney(40, 'eur')).toBe('€0.40');
    expect(formatMoney(49900, 'eur')).toBe('€499');
  });
});
