'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import type { Stripe, StripeCheckoutAmount, StripeCheckoutTotalSummary } from '@stripe/stripe-js';
import { summaryOf, type SummarySession } from '@/components/checkout/StripeCheckoutForm';
import { CheckoutForm, type CheckoutAdapter } from '@/components/checkout/CheckoutForm';
import { tokens } from '@/theme/tokens';
import { formatEuro, type Pack, type Period } from '@/components/pricing';
import { CheckoutDialog, CheckoutProvider, useCheckout, type CheckoutOrder, type CheckoutView } from '@/components/checkout/Checkout';

const { color } = tokens;

/** Stand-in for Stripe's Payment Element (an iframe from js.stripe.com in the real form), styled like our appearance. */
function MockPaymentElement() {
  const box = { border: `1px solid ${color.rule}`, borderRadius: '8px', bgcolor: color.paper, px: 1.5, py: 1.25, color: color.muted, fontSize: '0.9375rem', minHeight: 44 } as const;
  const label = { color: color.ink2, fontSize: '0.8125rem', fontWeight: 500, mb: 0.75 } as const;
  return (
    <Box data-testid="mock-payment-element" sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
        {['Card', 'Apple Pay', 'Google Pay'].map((t, i) => (
          <Box key={t} sx={{ ...box, fontSize: '0.8125rem', color: i === 0 ? color.ink : color.ink2, borderColor: i === 0 ? color.accent : color.rule, boxShadow: i === 0 ? `0 0 0 1px ${color.accent}` : 'none' }}>
            {t}
          </Box>
        ))}
      </Box>
      <div>
        <Box sx={label}>Card number</Box>
        <Box sx={box}>1234 1234 1234 1234</Box>
      </div>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <div>
          <Box sx={label}>Expiration date</Box>
          <Box sx={box}>MM / YY</Box>
        </div>
        <div>
          <Box sx={label}>Security code</Box>
          <Box sx={box}>CVC</Box>
        </div>
      </Box>
      <Box sx={{ color: color.muted, fontSize: '0.75rem' }}>Mock of Stripe&apos;s Payment Element (dev preview). The real one loads from Stripe.</Box>
    </Box>
  );
}

type PayMode = 'succeed' | 'decline' | 'badVat';

/** A Stripe amount exactly as the SDK gives it (StripeCheckoutAmount). */
const amount = (minorUnitsAmount: number): StripeCheckoutAmount => ({ minorUnitsAmount, amount: new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(minorUnitsAmount / 100) });

const previewCodes: Record<string, number> = { PREVIEW10: 10, PREVIEW100: 100 };

/** The session fields the form reads, in the real SDK shape (StripeCheckoutSession), so summaryOf runs as in production. */
export function mockSession(price: number, promo: string | null): SummarySession {
  const off = promo ? Math.round((price * (previewCodes[promo] ?? 0)) / 100) : 0;
  const zero = amount(0);
  const total: StripeCheckoutTotalSummary = {
    appliedBalance: zero,
    balanceAppliedToNextInvoice: false,
    discount: amount(off),
    shippingRate: zero,
    subtotal: amount(price),
    surcharge: zero,
    taxExclusive: zero,
    taxInclusive: zero,
    total: amount(price - off),
  };
  return {
    id: 'cs_test_devPreview0000',
    currency: 'eur',
    email: null,
    discountAmounts: promo ? [{ ...amount(off), displayName: `${previewCodes[promo]}% off`, promotionCode: promo, recurring: null, percentOff: previewCodes[promo] ?? null }] : null,
    total,
  };
}

/** The adapter the real form gets from Stripe, mocked: promo code PREVIEW10 takes 10 % off, PREVIEW100 the full price (the free order); Pay waits, then does what the toggle says. */
function MockForm({ order, payMode }: { order: CheckoutOrder; payMode: PayMode }) {
  const [promo, setPromo] = useState<string | null>(null);
  const adapter: CheckoutAdapter = {
    summary: summaryOf(mockSession(order.price, promo)),
    applyPromotionCode: async (code) => {
      await new Promise((r) => setTimeout(r, 400));
      const c = code.toUpperCase();
      if (!(c in previewCodes)) return { ok: false, error: "This code isn't valid." };
      setPromo(c);
      return { ok: true };
    },
    removePromotionCode: async () => setPromo(null),
    pay: async () => {
      await new Promise((r) => setTimeout(r, 1200));
      if (payMode === 'decline') return { ok: false, error: 'Your card was declined. Try another card.' };
      if (payMode === 'badVat') return { ok: false, field: 'vatId', error: 'Stripe says this VAT ID is not valid for the chosen country.' };
      window.alert('Preview: Stripe would now open the thanks page.');
      return { ok: false, error: 'Preview only: no payment was made.' };
    },
    payment: <MockPaymentElement />,
  };
  return <CheckoutForm order={{ packName: order.packName, period: order.period, maxServers: order.maxServers, servers: order.payload.servers }} adapter={adapter} />;
}

type State = CheckoutView['phase'] | 'failed-error' | 'failed-cardOff' | 'failed-blocked';
const states: { id: State; label: string }[] = [
  { id: 'ready', label: 'Form (mock Stripe)' },
  { id: 'loading', label: 'Loading' },
  { id: 'failed-error', label: 'Error' },
  { id: 'failed-cardOff', label: 'Card payment off' },
  { id: 'failed-blocked', label: 'Stripe.js blocked' },
  { id: 'redirecting', label: 'Redirecting (fallback)' },
];

function RealFlow({ order }: { order: CheckoutOrder }) {
  const { buy } = useCheckout();
  return (
    <Button variant="outlined" onClick={() => buy(order)}>
      Real flow: POST /api/checkout
    </Button>
  );
}

export function CheckoutPreview({ packs }: { packs: Pack[] }) {
  const [packId, setPackId] = useState(packs.find((p) => p.id === 'platform-m')?.id ?? packs[0].id);
  const [period, setPeriod] = useState<Period>('event');
  const [state, setState] = useState<State | 'closed'>('closed');
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const stripe = useMemo(() => ({}) as Stripe, []);
  const [payMode, setPayMode] = useState<PayMode>('decline');
  const order: CheckoutOrder = {
    payload: { pack: pack.id, period, servers: pack.maxServers, tools: [pack.product === 'platform' ? 'platform' : 'csm'], use: 'commercial' },
    packName: pack.name,
    maxServers: pack.maxServers,
    period,
    price: pack.prices[period],
  };
  const [secret, setSecret] = useState(0);

  const view: CheckoutView = (() => {
    switch (state) {
      case 'closed':
        return { phase: 'closed' };
      case 'ready':
        return { phase: 'ready', order, clientSecret: `cs_test_preview_${secret}`, stripe };
      case 'loading':
      case 'redirecting':
        return { phase: state, order };
      case 'failed-error':
        return { phase: 'failed', order, reason: 'error', error: "Couldn't start checkout. Try again, or request the license by email." };
      case 'failed-cardOff':
        return { phase: 'failed', order, reason: 'cardOff', error: '' };
      case 'failed-blocked':
        return {
          phase: 'failed',
          order,
          reason: 'blocked',
          error: 'Something in this browser stopped js.stripe.com, often an ad or tracker blocker. Allow it for this site and try again, or request the license by email.',
        };
      default:
        return { phase: 'closed' };
    }
  })();

  const chip = (active: boolean) => ({ textTransform: 'none', ...(active ? { bgcolor: color.paper3 } : {}) }) as const;

  return (
    <Container maxWidth="md" sx={{ py: 8, display: 'grid', gap: 4 }}>
      <div>
        <Typography variant="h1" sx={{ fontSize: '2rem' }}>
          Checkout dialog preview
        </Typography>
        <Typography sx={{ color: color.ink2, mt: 1, maxWidth: '60ch' }}>
          Development only. Every state of the checkout dialog: our own form, with a mock in place of Stripe&apos;s Payment Element and session. Try promo code PREVIEW10 (10 % off) or PREVIEW100 (free order: the card form stays, nothing is charged). Resize the window below 600 px for the phone
          (full-screen) layout.
        </Typography>
      </div>

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Typography sx={{ fontWeight: 600 }}>Pack</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {packs.map((p) => (
            <Button key={p.id} size="small" variant="outlined" onClick={() => setPackId(p.id)} sx={chip(p.id === packId)} aria-pressed={p.id === packId}>
              {p.name}
            </Button>
          ))}
        </Box>
        <Typography sx={{ fontWeight: 600, mt: 1 }}>Period</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {(['event', 'year', 'founder'] as const).map((p) => (
            <Button key={p} size="small" variant="outlined" onClick={() => setPeriod(p)} sx={chip(p === period)} aria-pressed={p === period}>
              {p} · {formatEuro(pack.prices[p])}
            </Button>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Typography sx={{ fontWeight: 600 }}>Open the dialog in a state</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {states.map((s) => (
            <Button
              key={s.id}
              variant="contained"
              data-testid={`preview-${s.id}`}
              onClick={() => {
                if (s.id === 'ready') setSecret((n) => n + 1);
                setState(s.id);
              }}
            >
              {s.label}
            </Button>
          ))}
        </Box>
        <Box sx={{ mt: 1 }}>
          <CheckoutProvider publishableKey="pk_test_devPreviewNotAKey">
            <RealFlow order={order} />
          </CheckoutProvider>
          <Typography sx={{ color: color.muted, fontSize: '0.875rem', mt: 1 }}>
            The real flow loads Stripe.js and calls /api/checkout; without STRIPE_SECRET_KEY it answers 503 and the dialog shows &quot;Card payment is off&quot;.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Typography sx={{ fontWeight: 600 }}>What Pay does in the mock</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {(
            [
              ['decline', 'Card declined'],
              ['badVat', 'VAT ID rejected'],
              ['succeed', 'Succeeds'],
            ] as const
          ).map(([id, label]) => (
            <Button key={id} size="small" variant="outlined" onClick={() => setPayMode(id)} sx={chip(id === payMode)} aria-pressed={id === payMode}>
              {label}
            </Button>
          ))}
        </Box>
      </Box>

      <CheckoutDialog
        view={view}
        onClose={() => setState('closed')}
        onRetry={() => setState('loading')}
        onPaying={() => undefined}
        renderForm={(v) => <MockForm key={v.clientSecret} order={v.order} payMode={payMode} />}
      />
    </Container>
  );
}
