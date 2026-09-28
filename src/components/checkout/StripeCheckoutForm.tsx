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
import type { Stripe, StripeCheckoutSession } from '@stripe/stripe-js';
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout';
import { tokens } from '@/theme/tokens';
import { stripeTaxId } from '@/lib/checkout';
import { saveCheckoutDetails } from '@/lib/requestCheckout';
import { stripeAppearance, stripeFonts } from './appearance';
import { CheckoutForm, type CheckoutAdapter, type CheckoutFormOrder, type CheckoutSummary, type PayInput, type PayResult } from './CheckoutForm';

const { color } = tokens;

type Checkout = Extract<ReturnType<typeof useCheckoutElements>, { type: 'success' }>['checkout'];

export function summaryOf(session: StripeCheckoutSession): CheckoutSummary {
  const discount = session.discountAmounts?.find((d) => d.promotionCode) ?? session.discountAmounts?.[0] ?? null;
  return {
    sessionId: session.id,
    currency: session.currency,
    subtotal: session.total.subtotal.minorUnitsAmount,
    discount: session.total.discount.minorUnitsAmount,
    total: session.total.total.minorUnitsAmount,
    promotionCode: discount?.promotionCode ?? null,
    email: session.email,
  };
}

const genericPayError = "The payment didn't go through. Check the details and try again, or use another card.";

/** Runs the pay steps against the session's actions. Exported for tests. */
export async function payWith(checkout: Pick<Checkout, 'updateTaxIdInfo' | 'runServerUpdate' | 'confirm' | 'id' | 'email'>, input: PayInput, fetcher: typeof fetch = fetch): Promise<PayResult> {
  const taxId = stripeTaxId(input.address.country, input.vatId);
  if (taxId) {
    const r = await checkout.updateTaxIdInfo({ businessName: input.company, taxId });
    if (r.type === 'error') return { ok: false, field: 'vatId', error: r.error.code === 'invalidTaxId' ? 'Stripe says this VAT ID is not valid for the chosen country.' : r.error.message };
  }

  let saved: Awaited<ReturnType<typeof saveCheckoutDetails>> = { ok: false, error: "Couldn't save your details. Try again." };
  const update = await checkout.runServerUpdate(async () => {
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
  });
  if (!saved.ok) return { ok: false, error: saved.error, ...(saved.field && saved.field !== 'sessionId' ? { field: saved.field } : {}) };
  if (update.type === 'error') return { ok: false, error: update.error.message || "Couldn't save your details. Try again." };

  const { line1, line2, postal_code, city, country } = input.address;
  const result = await checkout.confirm({
    ...(checkout.email ? {} : { email: input.email }),
    billingAddress: { name: input.company.trim(), address: { country, line1, line2: line2 || null, postal_code: postal_code || null, city } },
  });
  if (result.type === 'error') return { ok: false, error: result.error.message || genericPayError };
  return { ok: true };
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
      pay: (input) => payWith(checkout, input),
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
