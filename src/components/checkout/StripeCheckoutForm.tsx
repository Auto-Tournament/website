'use client';

/**
 * Our checkout form (CheckoutForm.tsx) on a real Checkout Session in custom
 * UI mode (ui_mode `elements`): Stripe's CheckoutElementsProvider holds the
 * session, the Payment Element takes the card (and wallets, and 3-D Secure),
 * and this file turns the session's actions into a CheckoutAdapter.
 *
 * On Pay: VAT ID → checkout.updateTaxIdInfo (with the company as the business
 * name); our other fields → /api/checkout/details through
 * checkout.runServerUpdate (session metadata); then checkout.confirm with the
 * email and the billing address (the company as its name). Stripe.js then
 * leaves for the session's return_url, the thanks page.
 */
import { useEffect, useMemo, useRef } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { Stripe, StripeCheckoutAmount, StripeCheckoutSession } from '@stripe/stripe-js';
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout';
import { tokens } from '@/theme/tokens';
import { stripeTaxId } from '@/lib/checkout';
import { saveCheckoutDetails } from '@/lib/requestCheckout';
import { stripeAppearance, stripeFonts } from './appearance';
import { CheckoutForm, type CheckoutAdapter, type CheckoutFormOrder, type CheckoutSummary, type PayInput, type PayResult } from './CheckoutForm';

const { color } = tokens;

type Checkout = Extract<ReturnType<typeof useCheckoutElements>, { type: 'success' }>['checkout'];

/**
 * Minor units as a number. The types say `number`; the value crosses from
 * Stripe's iframe, so coerce defensively (a "0" string must still count as 0).
 */
function minor(a: StripeCheckoutAmount): number {
  const n = Number(a.minorUnitsAmount);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

/**
 * True when the buyer owes nothing: `total.total` (StripeCheckoutTotalSummary,
 * after discounts and applied balance) is zero. Checks the minor units and,
 * as a second source, Stripe's own formatted `amount` ("€0.00"). The SDK has
 * no `paymentRequired` flag; `canConfirm` only says the session is complete
 * enough to confirm, not whether a payment method is needed.
 */
export function isFreeOrder(session: Pick<StripeCheckoutSession, 'total'>): boolean {
  const due = session.total.total;
  const n = minor(due);
  if (!Number.isNaN(n)) return n <= 0;
  const digits = String(due.amount ?? '').replace(/[^0-9]/g, '');
  return digits !== '' && /^0+$/.test(digits);
}

/** The session fields the form reads; the /dev/checkout mock builds exactly this shape. */
export type SummarySession = Pick<StripeCheckoutSession, 'id' | 'currency' | 'email' | 'discountAmounts' | 'total'>;

export function summaryOf(session: SummarySession): CheckoutSummary {
  const discount = session.discountAmounts?.find((d) => d.promotionCode) ?? session.discountAmounts?.[0] ?? null;
  const free = isFreeOrder(session);
  return {
    sessionId: session.id,
    currency: session.currency,
    subtotal: minor(session.total.subtotal),
    discount: minor(session.total.discount),
    total: free ? 0 : minor(session.total.total),
    // Stripe's own formatted total. confirm() throws unless the page reads and
    // shows total.total.amount (or minorUnitsAmount + currency + divisor), so
    // the Total row and the Pay button show this string.
    totalAmount: String(session.total.total.amount ?? ''),
    subtotalAmount: String(session.total.subtotal.amount ?? ''),
    discountAmount: String(session.total.discount.amount ?? ''),
    free,
    promotionCode: discount?.promotionCode ?? null,
    email: session.email,
  };
}

const genericPayError = "The payment didn't go through. Check the details and try again, or use another card.";

/** Shown when a step throws or hangs: never an endless spinner. */
export const stuckPayError = 'Something went wrong. Nothing was charged. Try again or contact us.';

/** How long one pay step may take before the form gives up and says so. */
export const payStepTimeoutMs = 20_000;

class StepTimeout extends Error {
  constructor(step: string) {
    super(`${step} timed out`);
    this.name = 'StepTimeout';
  }
}

function withTimeout<T>(step: string, p: Promise<T>, ms: number | null): Promise<T> {
  if (ms === null) return p;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeout(step)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/** Logs a failed step without personal data: the step, the error's name and Stripe's code. */
function logStep(step: string, err: unknown) {
  const e = err as { name?: unknown; code?: unknown } | null;
  console.error('[checkout] pay step failed', {
    step,
    error: typeof e?.name === 'string' ? e.name : 'unknown',
    ...(typeof e?.code === 'string' ? { code: e.code } : {}),
  });
}

type PayCheckout = Pick<Checkout, 'updateTaxIdInfo' | 'runServerUpdate' | 'confirm' | 'id' | 'email'>;

/**
 * Runs the pay steps against the session's actions. Exported for tests.
 *
 * Every step is bounded by `timeoutMs` and any throw becomes a visible error.
 * A paid confirm is not bounded: 3-D Secure can keep the buyer in Stripe's
 * challenge longer than that; a free confirm has nothing for the buyer to do.
 */
export async function payWith(
  checkout: PayCheckout,
  input: PayInput,
  fetcher: typeof fetch = fetch,
  { free = false, timeoutMs = payStepTimeoutMs }: { free?: boolean; timeoutMs?: number } = {},
): Promise<PayResult> {
  let step = 'updateTaxIdInfo';
  try {
    const taxId = stripeTaxId(input.address.country, input.vatId);
    if (taxId) {
      const r = await withTimeout(step, checkout.updateTaxIdInfo({ businessName: input.company, taxId }), timeoutMs);
      if (r.type === 'error') return { ok: false, field: 'vatId', error: r.error.code === 'invalidTaxId' ? 'Stripe says this VAT ID is not valid for the chosen country.' : r.error.message };
    }

    step = 'runServerUpdate';
    let saved: Awaited<ReturnType<typeof saveCheckoutDetails>> = { ok: false, error: "Couldn't save your details. Try again." };
    const update = await withTimeout(
      step,
      checkout.runServerUpdate(async () => {
        saved = await saveCheckoutDetails(
          {
            sessionId: checkout.id,
            company: input.company,
            eventName: input.eventName,
            eventDates: input.eventDates,
            vatId: input.vatId,
            business: input.business,
            terms: input.terms,
          },
          fetcher,
        );
        if (!saved.ok) throw new Error('details not saved');
      }),
      timeoutMs,
    );
    if (!saved.ok) return { ok: false, error: saved.error, ...(saved.field && saved.field !== 'sessionId' ? { field: saved.field } : {}) };
    if (update.type === 'error') return { ok: false, error: update.error.message || "Couldn't save your details. Try again." };

    step = 'confirm';
    const { line1, line2, postal_code, city, country } = input.address;
    const result = await withTimeout(
      step,
      checkout.confirm({
        ...(checkout.email ? {} : { email: input.email }),
        billingAddress: { name: input.company.trim(), address: { country, line1, line2: line2 || null, postal_code: postal_code || null, city } },
      }),
      free ? timeoutMs : null,
    );
    if (result.type === 'error') {
      logStep(step, result.error);
      return { ok: false, error: result.error.message || genericPayError };
    }
    return { ok: true };
  } catch (err) {
    logStep(step, err);
    return { ok: false, error: stuckPayError };
  }
}

function Form({ order, onPaying, onInitFailed }: { order: CheckoutFormOrder; onPaying: (p: boolean) => void; onInitFailed: () => void }) {
  const state = useCheckoutElements();
  const failed = useRef(false);
  useEffect(() => {
    if (state.type === 'error' && !failed.current) {
      failed.current = true;
      console.error('[checkout] custom checkout did not start', state.error.message);
      onInitFailed();
    }
  }, [state, onInitFailed]);

  const checkout = state.type === 'success' ? state.checkout : null;
  const adapter = useMemo<CheckoutAdapter | null>(() => {
    if (!checkout) return null;
    return {
      summary: summaryOf(checkout),
      applyPromotionCode: async (code) => {
        const r = await checkout.applyPromotionCode(code);
        return r.type === 'success' ? { ok: true } : { ok: false, error: r.error.message || "That code doesn't work for this order." };
      },
      removePromotionCode: async () => {
        await checkout.removePromotionCode();
      },
      pay: (input) => payWith(checkout, input, fetch, { free: isFreeOrder(checkout) }),
      payment: <PaymentElement options={{ layout: { type: 'tabs' }, fields: { billingDetails: { address: 'never', email: 'never', name: 'auto' } } }} />,
    };
  }, [checkout]);

  if (!adapter) {
    return (
      <Box role="status" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.25, color: color.ink2, py: 8 }}>
        <CircularProgress size={18} thickness={5} aria-hidden sx={{ color: color.accent }} />
        Loading secure checkout…
      </Box>
    );
  }
  return <CheckoutForm order={order} adapter={adapter} onPaying={onPaying} />;
}

export function StripeCheckoutForm({
  stripe,
  clientSecret,
  order,
  onPaying,
  onInitFailed,
}: {
  stripe: Stripe;
  clientSecret: string;
  order: CheckoutFormOrder;
  onPaying: (p: boolean) => void;
  onInitFailed: () => void;
}) {
  const options = useMemo(() => ({ clientSecret, elementsOptions: { appearance: stripeAppearance, fonts: stripeFonts } }), [clientSecret]);
  return (
    <CheckoutElementsProvider stripe={stripe} options={options}>
      <Form order={order} onPaying={onPaying} onInitFailed={onInitFailed} />
    </CheckoutElementsProvider>
  );
}
