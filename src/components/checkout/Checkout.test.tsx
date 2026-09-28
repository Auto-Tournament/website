// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CheckoutProvider, useCheckout, type BuyOutcome, type CheckoutOrder } from './Checkout';

// The dialog with a mocked Stripe.js loader: no network, no real Stripe.

const embedded = { mount: vi.fn(), unmount: vi.fn(), destroy: vi.fn() };
const createEmbeddedCheckoutPage = vi.fn(async () => embedded);
const fakeStripe = {
  elements: () => undefined,
  createToken: () => undefined,
  createPaymentMethod: () => undefined,
  confirmCardPayment: () => undefined,
  createEmbeddedCheckoutPage,
};
const loadStripe = vi.fn(async (_key: string) => fakeStripe as unknown);
vi.mock('@stripe/stripe-js/pure', () => ({ loadStripe: (key: string) => loadStripe(key) }));

const order: CheckoutOrder = {
  payload: { pack: 'platform-m', period: 'year', servers: 20, tools: ['platform'], use: 'commercial' },
  packName: 'Platform M',
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

    await waitFor(() => expect(embedded.mount).toHaveBeenCalled());
    expect(loadStripe).toHaveBeenCalledWith('pk_test_unit');
    expect(createEmbeddedCheckoutPage).toHaveBeenCalledWith(expect.objectContaining({ clientSecret: 'cs_test_1_secret_x' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/checkout', expect.objectContaining({ method: 'POST', body: JSON.stringify(order.payload) }));
    expect(outcome).toEqual({ kind: 'opened' });

    // Close destroys the Stripe instance.
    fireEvent.click(screen.getByRole('button', { name: 'Close checkout' }));
    await waitFor(() => expect(embedded.destroy).toHaveBeenCalled());
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
    expect(createEmbeddedCheckoutPage).not.toHaveBeenCalled();
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
