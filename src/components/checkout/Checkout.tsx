'use client';

/*
 * Hallmark · component: modal (embedded checkout dialog) · genre: modern-minimal · theme: Auto Tournament system (tokens.ts)
 * states: default · hover · focus · active · disabled · loading · error · success (Stripe opens the thanks page)
 * contrast: pass (ink / ink2 / muted on paper2)
 */

/**
 * The one way the site starts a card checkout. Every Buy button (the pack
 * cards, the founding supporter strip, the pricing guide's result and the
 * console's Buy page) calls `useCheckout().buy(order)`.
 *
 * With a publishable key (STRIPE_PUBLISHABLE_KEY, passed down by the page's
 * server component) the buyer stays on our site: a dialog opens with our own
 * checkout form (CheckoutForm.tsx) on a custom-UI Checkout Session, with
 * Stripe's Payment Element for the card. After paying, Stripe.js opens the
 * session's return_url, the thanks page with the key.
 *
 * Without one, outside a CheckoutProvider, or when the custom form can't start
 * in this browser, it is hosted Checkout as before: the browser goes to
 * checkout.stripe.com.
 *
 * Stripe.js is only loaded when someone clicks Buy (the `pure` entry point
 * doesn't load it on import).
 */
import { CheckoutDefaultsContext, type CheckoutDefaults } from './CheckoutForm';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { EnvelopeSimple } from '@phosphor-icons/react/dist/csr/EnvelopeSimple';
import { LockSimple } from '@phosphor-icons/react/dist/csr/LockSimple';
import { ShieldWarning } from '@phosphor-icons/react/dist/csr/ShieldWarning';
import { WarningCircle } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { formatEuro, periodLabels, vatShort, type Period } from '@/components/pricing';
import { seller } from '@/components/seller';
import type { CheckoutRequest } from '@/lib/checkout';
import { requestCheckout } from '@/lib/requestCheckout';

const { color, radius } = tokens;

/** What is being bought: the /api/checkout body, and what the dialog shows above the form. */
export type CheckoutOrder = {
  payload: CheckoutRequest;
  packName: string;
  /** The pack's server limit, shown in the order summary. */
  maxServers?: number;
  period: Period;
  /** Cents, as shown on the button. Display only: Stripe charges its own price. */
  price: number;
};

/**
 * - `redirecting`: the browser is on its way to hosted Checkout; keep the button loading.
 * - `opened`: the dialog has it (the form, an error, or it was closed while loading).
 * - `failed`: `shownInDialog` says whether the dialog already shows the error.
 */
export type BuyOutcome =
  | { kind: 'redirecting' }
  | { kind: 'opened' }
  | { kind: 'failed'; cardOff: boolean; error: string; shownInDialog: boolean };

type CheckoutApi = { buy: (order: CheckoutOrder) => Promise<BuyOutcome>; embedded: boolean };

/** Why the form isn't there: the server said no, card payment is off, or Stripe.js didn't load. */
export type FailReason = 'error' | 'cardOff' | 'blocked';

export type CheckoutView =
  | { phase: 'closed' }
  | { phase: 'loading'; order: CheckoutOrder }
  | { phase: 'redirecting'; order: CheckoutOrder }
  | { phase: 'ready'; order: CheckoutOrder; clientSecret: string; stripe: Stripe }
  | { phase: 'failed'; order: CheckoutOrder; reason: FailReason; error: string };

const reloadError = 'Checkout was just updated. Reload the page and try again.';
const stripeLoadError =
  "Something in this browser stopped js.stripe.com, often an ad or tracker blocker. Allow it for this site and try again, or request the license by email.";

/** Hosted Checkout: POST, then go to Stripe. */
async function buyHosted(order: CheckoutOrder): Promise<BuyOutcome> {
  const answer = await requestCheckout(order.payload);
  if (answer.kind === 'redirect') {
    window.location.assign(answer.url);
    return { kind: 'redirecting' };
  }
  if (answer.kind === 'embedded') return { kind: 'failed', cardOff: false, error: reloadError, shownInDialog: false };
  return { kind: 'failed', cardOff: answer.cardOff, error: answer.error, shownInDialog: false };
}

const hostedApi: CheckoutApi = { buy: buyHosted, embedded: false };
const CheckoutContext = createContext<CheckoutApi>(hostedApi);

export function useCheckout(): CheckoutApi {
  return useContext(CheckoutContext);
}

/** One Stripe.js load per key; a failed load (blocked script, offline) is tried again next time. */
const stripeLoads = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string): Promise<Stripe | null> {
  let load = stripeLoads.get(key);
  if (!load) {
    load = loadStripe(key).catch(() => null);
    stripeLoads.set(key, load);
  }
  return load.then((stripe) => {
    if (!stripe) stripeLoads.delete(key);
    return stripe;
  });
}

export function CheckoutProvider({
  publishableKey,
  country = null,
  defaults = null,
  children,
}: {
  publishableKey: string | null;
  /** From CF-IPCountry, read by the page. */
  country?: string | null;
  /** The console's Buy page: the organization's details to start the form with. */
  defaults?: CheckoutDefaults | null;
  children: ReactNode;
}) {
  const [view, setView] = useState<CheckoutView>({ phase: 'closed' });
  // Set when Stripe says the buyer pressed Pay, cleared when that failed: closing then asks first.
  const [paying, setPaying] = useState(false);
  // Each buy gets a number; a closed dialog or a newer buy makes an older answer stale.
  const attempt = useRef(0);

  const buyEmbedded = useCallback(
    async (order: CheckoutOrder): Promise<BuyOutcome> => {
      if (!publishableKey) return buyHosted(order);
      const mine = ++attempt.current;
      setPaying(false);
      setView({ phase: 'loading', order });
      const [answer, stripe] = await Promise.all([requestCheckout(order.payload), stripeFor(publishableKey)]);
      if (mine !== attempt.current) return { kind: 'opened' };
      if (answer.kind === 'redirect') {
        // The server fell back to hosted Checkout (key removed since the page loaded).
        setView({ phase: 'redirecting', order });
        window.location.assign(answer.url);
        return { kind: 'redirecting' };
      }
      if (answer.kind === 'failed') {
        setView({ phase: 'failed', order, reason: answer.cardOff ? 'cardOff' : 'error', error: answer.error });
        return { kind: 'failed', cardOff: answer.cardOff, error: answer.error, shownInDialog: true };
      }
      if (!stripe) {
        setView({ phase: 'failed', order, reason: 'blocked', error: stripeLoadError });
        return { kind: 'failed', cardOff: false, error: stripeLoadError, shownInDialog: true };
      }
      setView({ phase: 'ready', order, clientSecret: answer.clientSecret, stripe });
      return { kind: 'opened' };
    },
    [publishableKey],
  );

  /** The custom form couldn't start (Stripe.js refused the session): hosted Checkout instead. */
  const fallBackToHosted = useCallback(async (order: CheckoutOrder) => {
    const mine = ++attempt.current;
    setView({ phase: 'redirecting', order });
    const answer = await requestCheckout(order.payload, fetch, true);
    if (mine !== attempt.current) return;
    if (answer.kind === 'redirect') {
      window.location.assign(answer.url);
      return;
    }
    const error = answer.kind === 'failed' ? answer.error : reloadError;
    setView({ phase: 'failed', order, reason: answer.kind === 'failed' && answer.cardOff ? 'cardOff' : 'error', error });
  }, []);

  const close = useCallback(() => {
    if (paying && !window.confirm('Your payment may still be going through. Close checkout anyway?')) return;
    attempt.current++;
    setPaying(false);
    // Unmounting CheckoutElementsProvider drops the session's elements.
    setView({ phase: 'closed' });
  }, [paying]);

  const api = useMemo<CheckoutApi>(() => ({ buy: buyEmbedded, embedded: publishableKey !== null }), [buyEmbedded, publishableKey]);

  return (
    <CheckoutContext.Provider value={api}>
      <CheckoutDefaultsContext.Provider value={defaults}>
        {children}
        {publishableKey && <CheckoutDialog view={view} country={country} onClose={close} onRetry={buyEmbedded} onPaying={setPaying} onInitFailed={fallBackToHosted} />}
      </CheckoutDefaultsContext.Provider>
    </CheckoutContext.Provider>
  );
}

/* ------------------------------------------------------------------ dialog */

const failCopy: Record<FailReason, { title: string; Icon: typeof WarningCircle }> = {
  error: { title: "Checkout didn't open", Icon: WarningCircle },
  cardOff: { title: 'Card payment is off right now', Icon: EnvelopeSimple },
  blocked: { title: "Stripe's payment form didn't load", Icon: ShieldWarning },
};

const cardOffBody = "You can still buy this pack: email us and we'll send an invoice for the same price.";

function mailFor(order: CheckoutOrder): string {
  const subject = `License request: ${order.packName}, ${periodLabels[order.period]}`;
  const body = [`Pack: ${order.packName}`, `Period: ${periodLabels[order.period]}`, `Price: ${formatEuro(order.price)} ${vatShort}`, '', 'Name / company: ', 'Org number / VAT ID: ', 'Event name and date(s): '].join('\n');
  return `mailto:${seller.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const noMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none', transition: 'none' } } as const;

/** Roughly the Stripe form's shape (email, card, name, button), so the dialog doesn't jump when it arrives. */
function FormSkeleton() {
  const bar = (height: number, width: string | number = '100%') => (
    <Skeleton variant="rounded" animation="pulse" height={height} width={width} sx={{ bgcolor: color.paper3, borderRadius: `${radius.sm}px`, ...noMotion }} />
  );
  return (
    <Box aria-hidden sx={{ display: 'grid', gap: 1.25, width: '100%', maxWidth: 440, mx: 'auto' }}>
      {bar(14, '30%')}
      {bar(44)}
      <Box sx={{ height: 8 }} />
      {bar(14, '40%')}
      {bar(88)}
      <Box sx={{ height: 8 }} />
      {bar(14, '35%')}
      {bar(44)}
      <Box sx={{ height: 12 }} />
      {bar(48)}
    </Box>
  );
}

// @stripe/react-stripe-js/checkout and the MUI date picker (used by CheckoutForm,
// which StripeCheckoutForm renders) only ship to the browser once someone opens
// the dialog, not on every /pricing load.
const StripeCheckoutForm = dynamic(() => import('./StripeCheckoutForm').then((mod) => mod.StripeCheckoutForm), {
  ssr: false,
  loading: FormSkeleton,
});

function Status({ children, spinner = false }: { children: ReactNode; spinner?: boolean }) {
  return (
    <Box role="status" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.25, color: color.ink2, fontSize: '0.9375rem' }}>
      {spinner && <CircularProgress size={18} thickness={5} aria-hidden sx={{ color: color.accent, ...noMotion }} />}
      {children}
    </Box>
  );
}

export function CheckoutDialog({
  view,
  country = null,
  onClose,
  onRetry,
  onPaying,
  onInitFailed,
  renderForm,
}: {
  view: CheckoutView;
  country?: string | null;
  onClose: () => void;
  onRetry: (order: CheckoutOrder) => void;
  onPaying: (paying: boolean) => void;
  onInitFailed?: (order: CheckoutOrder) => void;
  /** The /dev/checkout preview's form on a mocked Stripe; the real dialog leaves it out. */
  renderForm?: (view: Extract<CheckoutView, { phase: 'ready' }>) => ReactNode;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // Keep the last order on screen while the dialog fades out.
  const lastOrder = useRef<CheckoutOrder | null>(null);
  if (view.phase !== 'closed') lastOrder.current = view.order;
  const order = lastOrder.current;

  return (
    <Dialog
      open={view.phase !== 'closed'}
      onClose={onClose}
      fullScreen={phone}
      fullWidth
      maxWidth={false}
      scroll="paper"
      transitionDuration={reducedMotion ? 150 : { enter: 250, exit: 200 }}
      aria-labelledby="checkout-title"
      aria-describedby="checkout-summary"
      data-testid="checkout-dialog"
      slotProps={{
        backdrop: { sx: { bgcolor: 'rgba(0, 0, 0, 0.66)' } },
        paper: {
          sx: {
            width: phone ? '100%' : 'min(100% - 48px, 1000px)',
            maxWidth: 'none',
            // Explicit flex column and a max height that matches the height:
            // MUI's own calc(100% - 64px) cap otherwise wins over ours.
            display: 'flex',
            flexDirection: 'column',
            height: phone ? '100%' : 'min(100% - 48px, 860px)',
            maxHeight: phone ? '100%' : 'calc(100% - 48px)',
            m: phone ? 0 : 3,
            bgcolor: color.paper2,
            color: color.ink,
            backgroundImage: 'none',
            border: phone ? 0 : `1px solid ${color.rule}`,
            borderRadius: phone ? 0 : `${radius.lg}px`,
            boxShadow: phone ? 'none' : '0 24px 80px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden',
          },
        },
      }}
    >
      {/* The order, always visible above the form: pack, period, price. */}
      <Box
        component="header"
        sx={{
          display: 'grid',
          gridTemplateColumns: view.phase === 'ready' ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto auto',
          columnGap: { xs: 1.5, sm: 2.5 },
          alignItems: 'center',
          px: { xs: 2, sm: 3 },
          py: { xs: 1.5, sm: 2 },
          borderBottom: `1px solid ${color.rule}`,
          bgcolor: color.paper2,
          flex: '0 0 auto',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            id="checkout-title"
            component="h2"
            sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: { xs: '1.0625rem', sm: '1.25rem' }, lineHeight: 1.25, overflowWrap: 'anywhere' }}
          >
            {order ? `${order.packName} license` : 'Checkout'}
          </Typography>
          {order && (
            <Typography id="checkout-summary" data-testid="checkout-summary" sx={{ color: color.ink2, fontSize: { xs: '0.8125rem', sm: '0.9375rem' }, mt: 0.25 }}>
              {periodLabels[order.period]}
              <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                , {formatEuro(order.price)} {vatShort}
              </Box>
            </Typography>
          )}
        </Box>
        {order && view.phase !== 'ready' && (
          <Box aria-hidden sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <Box sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              {formatEuro(order.price)}
            </Box>
            <Box sx={{ color: color.muted, fontSize: '0.75rem', mt: 0.25 }}>{vatShort}</Box>
          </Box>
        )}
        <IconButton
          onClick={onClose}
          aria-label="Close checkout"
          data-testid="checkout-close"
          sx={{
            width: 44,
            height: 44,
            color: color.ink2,
            border: `1px solid ${color.rule}`,
            transition: 'background-color 150ms, color 150ms',
            '@media (hover: hover)': { '&:hover': { bgcolor: color.paper3, color: color.ink } },
            '&:active': { transform: 'translateY(1px)' },
            '&.Mui-focusVisible': { outline: `2px solid ${color.focus}`, outlineOffset: 2 },
          }}
        >
          <X size={20} weight="bold" aria-hidden />
        </IconButton>
      </Box>

      <Box data-testid="checkout-body" sx={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column' }}>
        {view.phase === 'loading' && (
          <Box sx={{ display: 'grid', gap: 3, alignContent: 'start', px: { xs: 2, sm: 3 }, py: { xs: 4, sm: 6 } }}>
            <Status spinner>Opening secure checkout…</Status>
            <FormSkeleton />
          </Box>
        )}

        {view.phase === 'redirecting' && (
          <Box sx={{ display: 'grid', placeItems: 'center', flex: 1, px: 2 }}>
            <Status spinner>Taking you to Stripe&apos;s checkout page…</Status>
          </Box>
        )}

        {view.phase === 'failed' && (
          <FailedState view={view} onRetry={() => onRetry(view.order)} onClose={onClose} />
        )}

        {view.phase === 'ready' && (
          <Box data-testid="checkout-embed" sx={{ flex: '1 0 auto' }}>
            {renderForm ? (
              renderForm(view)
            ) : (
              // key: a new session is a new provider; unmounting drops the old one.
              <StripeCheckoutForm
                key={view.clientSecret}
                stripe={view.stripe}
                clientSecret={view.clientSecret}
                order={{ packName: view.order.packName, period: view.order.period, maxServers: view.order.maxServers, servers: view.order.payload.servers }}
                country={country}
                onPaying={onPaying}
                onInitFailed={() => onInitFailed?.(view.order)}
              />
            )}
          </Box>
        )}
      </Box>

      {view.phase !== 'ready' && (
        <Box
          component="footer"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: { xs: 2, sm: 3 },
            py: 1.5,
            borderTop: `1px solid ${color.rule}`,
            color: color.muted,
            fontSize: '0.8125rem',
            flex: '0 0 auto',
          }}
        >
          <LockSimple size={14} aria-hidden />
          <span>Payment by Stripe. Card details go straight to Stripe, never to us.</span>
        </Box>
      )}
    </Dialog>
  );
}

function FailedState({
  view,
  onRetry,
  onClose,
}: {
  view: Extract<CheckoutView, { phase: 'failed' }>;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { title, Icon } = failCopy[view.reason];
  const cardOff = view.reason === 'cardOff';
  const mail = mailFor(view.order);
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', flex: 1, px: { xs: 2, sm: 3 }, py: { xs: 5, sm: 8 } }}>
      <Box role="alert" data-testid="checkout-error" data-reason={view.reason} sx={{ display: 'grid', gap: 2, maxWidth: '46ch', width: '100%' }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radius.md}px`,
            bgcolor: color.paper3,
            border: `1px solid ${color.rule}`,
            color: cardOff ? color.ink2 : color.ban,
          }}
        >
          <Icon size={24} aria-hidden />
        </Box>
        <div>
          <Typography component="h3" sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1.25rem', color: color.ink }}>
            {title}
          </Typography>
          <Typography sx={{ mt: 1, color: color.ink2 }}>{cardOff ? cardOffBody : view.error}</Typography>
        </div>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, mt: 0.5 }}>
          {cardOff ? (
            <>
              <Button variant="contained" href={mail} sx={{ whiteSpace: 'nowrap' }}>
                Request by email
              </Button>
              <Button variant="text" onClick={onClose} sx={{ color: color.ink, whiteSpace: 'nowrap' }}>
                Close
              </Button>
            </>
          ) : (
            <>
              <Button variant="contained" onClick={onRetry} sx={{ whiteSpace: 'nowrap' }}>
                Try again
              </Button>
              <Button variant="outlined" href={mail} sx={{ whiteSpace: 'nowrap' }}>
                Request by email
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
