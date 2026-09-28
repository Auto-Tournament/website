'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import type { Stripe } from '@stripe/stripe-js';
import { tokens } from '@/theme/tokens';
import { formatEuro, type Pack, type Period } from '@/components/pricing';
import { CheckoutDialog, CheckoutProvider, useCheckout, type CheckoutOrder, type CheckoutView } from '@/components/checkout/Checkout';

const { color } = tokens;

/** A stand-in for Stripe's form: roughly its fields, in an iframe, so the dialog can be judged without keys. */
const mockForm = `<!doctype html><html><head><style>
  body{margin:0;font:15px/1.4 -apple-system,system-ui,sans-serif;color:#30313d;background:#fff}
  .wrap{max-width:440px;margin:0 auto;padding:28px 20px 40px}
  .note{background:#fff4e5;border:1px solid #f5c98a;border-radius:6px;padding:8px 10px;font-size:13px;margin-bottom:20px}
  label{display:block;font-size:13px;margin:16px 0 6px;color:#6d6e78}
  .f{border:1px solid #e0e0e6;border-radius:6px;height:42px;box-shadow:0 1px 1px rgba(0,0,0,.03)}
  .tall{height:84px}.pay{margin-top:24px;height:46px;border-radius:6px;background:#0570de;color:#fff;display:grid;place-items:center;font-weight:600}
  .chk{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-top:16px}.box{width:16px;height:16px;border:1px solid #c0c0c8;border-radius:4px;flex:none}
</style></head><body><div class="wrap">
  <div class="note">Mock of Stripe's embedded form (dev preview). The real one comes from Stripe.</div>
  <label>Email</label><div class="f"></div>
  <label>Card information</label><div class="f tall"></div>
  <label>Business name</label><div class="f"></div>
  <label>I'm buying for a business, not as a consumer</label><div class="f"></div>
  <label>Event date(s), or start date if yearly or founder</label><div class="f"></div>
  <label>Event or client name, and website</label><div class="f"></div>
  <label>Billing address</label><div class="f tall"></div>
  <div class="chk"><div class="box"></div><div>I accept the Commercial License Terms and the Terms of Sale.</div></div>
  <div class="pay">Pay</div>
</div></body></html>`;

function mockStripe(): Stripe {
  const fn = () => undefined;
  return {
    elements: fn,
    createToken: fn,
    createPaymentMethod: fn,
    confirmCardPayment: fn,
    createEmbeddedCheckoutPage: async () => {
      let frame: HTMLIFrameElement | null = null;
      return {
        mount(el: HTMLElement) {
          frame = document.createElement('iframe');
          frame.title = 'Mock payment form';
          frame.srcdoc = mockForm;
          frame.style.cssText = 'display:block;width:100%;height:860px;border:0;border-radius:12px;background:#fff';
          el.appendChild(frame);
        },
        unmount() {
          frame?.remove();
        },
        destroy() {
          frame?.remove();
        },
      };
    },
  } as unknown as Stripe;
}

type State = CheckoutView['phase'] | 'failed-error' | 'failed-cardOff' | 'failed-blocked';
const states: { id: State; label: string }[] = [
  { id: 'ready', label: 'Form (mock)' },
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
  const stripe = useMemo(mockStripe, []);
  const order: CheckoutOrder = {
    payload: { pack: pack.id, period, servers: pack.maxServers, tools: [pack.product === 'platform' ? 'platform' : 'csm'], use: 'commercial' },
    packName: pack.name,
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
          Development only. Every state of the embedded checkout dialog; the form is a mock of Stripe&apos;s. Resize the window below 600 px for the phone
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

      <CheckoutDialog view={view} onClose={() => setState('closed')} onRetry={() => setState('loading')} onPaying={() => undefined} />
    </Container>
  );
}
