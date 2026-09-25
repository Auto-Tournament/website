'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import {
  communityDiscount,
  communityEventHelp,
  periodLabels,
  seatPrices,
  toolLabels,
  toolOrder,
  useTypeLabels,
  useTypeOrder,
  type Period,
  type ToolOption,
  type UseType,
} from '@/components/pricing';
import { checkoutToolFor, deriveOption, maxSeats, type CheckoutOption, type CheckoutRequest } from '@/lib/checkout';

const { color, radius } = tokens;

const email = 'sivert@autotournament.gg';

const currency = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

type Quote =
  | { kind: 'prompt' }
  | { kind: 'free'; reason: string }
  | { kind: 'nonprofit-free' }
  | { kind: 'price'; option: CheckoutOption; pricePerSeat: number; reason: string };

function quoteFor(useType: UseType, tools: Set<ToolOption>, period: Period): Quote {
  if (useType === 'personal') {
    return { kind: 'free', reason: 'Free: personal and non-commercial use' };
  }
  if (useType === 'nonprofit') {
    return { kind: 'nonprofit-free' };
  }

  const hasServerManager = tools.has('serverManager');
  const hasReadyUp = tools.has('readyUp');
  const hasMatchzy = tools.has('matchzy');
  // Same derivation as /api/checkout, so the calculator and the server agree.
  const option = deriveOption([...tools].map((t) => checkoutToolFor[t]));

  if (option === 'platform') {
    return {
      kind: 'price',
      option,
      pricePerSeat: seatPrices.platform[period],
      reason: 'Platform rate: the platform includes CS2 Server Manager and Ready Up',
    };
  }

  if (option === 'servers') {
    const names = [hasServerManager && 'CS2 Server Manager', hasReadyUp && 'Ready Up'].filter(Boolean);
    const verb = names.length > 1 ? 'count once per seat' : 'counts per seat';
    return {
      kind: 'price',
      option,
      pricePerSeat: seatPrices.servers[period],
      reason: `Servers rate: ${names.join(' + ')} ${verb}`,
    };
  }

  if (hasMatchzy) {
    return { kind: 'free', reason: 'Free: MatchZy Enhanced is MIT, free for any use' };
  }

  return { kind: 'prompt' };
}

export function PriceCalculator() {
  const [tools, setTools] = useState<Set<ToolOption>>(new Set());
  const [useType, setUseType] = useState<UseType>('commercial');
  const [period, setPeriod] = useState<Period>('event');
  const [seatsInput, setSeatsInput] = useState('10');
  const [community, setCommunity] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // Card checkout switched off after the server said so: for everything (503,
  // no Stripe key) or only with the community discount (no coupon set yet).
  const [cardOff, setCardOff] = useState(false);
  const [communityCardOff, setCommunityCardOff] = useState(false);

  const toolsId = useId();
  const useTypeId = useId();
  const periodId = useId();
  const seatsId = useId();
  const communityId = useId();
  const helpId = useId();

  const seats = Number.parseInt(seatsInput, 10);
  const seatsValid = Number.isInteger(seats) && seats >= 1 && String(seats) === seatsInput.trim();

  const quote = useMemo(() => quoteFor(useType, tools, period), [useType, tools, period]);

  const subtotal = quote.kind === 'price' && seatsValid ? seats * quote.pricePerSeat : 0;
  const discountAmount = quote.kind === 'price' && community ? subtotal * communityDiscount : 0;
  const total = subtotal - discountAmount;

  // A new selection clears the last checkout error.
  useEffect(() => {
    setCheckoutError(null);
  }, [tools, useType, period, seatsInput, community]);

  // Coming back from Stripe with the back button can restore this page from
  // the bfcache with the button still in its loading state.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setCheckoutLoading(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const cardAvailable =
    quote.kind === 'price' && seatsValid && seats <= maxSeats && useType === 'commercial' && !cardOff && !(community && communityCardOff);

  const startCheckout = async () => {
    if (quote.kind !== 'price' || !cardAvailable || checkoutLoading) return;
    const payload: CheckoutRequest = {
      option: quote.option,
      period: period === 'yearly' ? 'year' : 'event',
      seats,
      tools: toolOrder.filter((t) => tools.has(t)).map((t) => checkoutToolFor[t]),
      use: 'commercial',
      community,
    };
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: unknown = await res.json().catch(() => null);
      const field = (key: string) =>
        typeof data === 'object' && data !== null && typeof (data as Record<string, unknown>)[key] === 'string'
          ? ((data as Record<string, unknown>)[key] as string)
          : undefined;
      const url = field('url');
      if (res.ok && url && url.startsWith('https://')) {
        // Leave the button in its loading state while the browser navigates.
        window.location.assign(url);
        return;
      }
      if (res.status === 503) {
        setCardOff(true);
        setCheckoutError("Card payment isn't available right now. Request the license by email instead.");
      } else if (res.status === 400 && community && field('error')?.startsWith('Community discount')) {
        setCommunityCardOff(true);
        setCheckoutError('Community discount needs a quick check first: email us with the request below.');
      } else if (res.status === 400 || res.status === 413 || res.status === 429) {
        setCheckoutError(field('error') ?? 'Something went wrong. Request the license by email instead.');
      } else {
        setCheckoutError("Couldn't start checkout. Try again, or request the license by email.");
      }
    } catch {
      setCheckoutError("Couldn't reach checkout. Try again, or request the license by email.");
    }
    setCheckoutLoading(false);
  };

  const toggleTool = (tool: ToolOption) => {
    setTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  };

  const mailHref = useMemo(() => {
    if (quote.kind !== 'price' || !seatsValid) return undefined;
    const toolsLabel = toolOrder.filter((t) => tools.has(t)).map((t) => toolLabels[t]).join(', ');
    const useLabel = useTypeLabels[useType];
    const periodLabel = periodLabels[period];
    const subject = `License request: ${toolsLabel}, ${periodLabel}, ${seats} seats`;
    const lines = [
      `Tools: ${toolsLabel}`,
      `Use: ${useLabel}`,
      `Period: ${periodLabel}`,
      `Seats: ${seats}`,
      `Community discount: ${community ? 'yes (50%)' : 'no'}`,
      `Total: ${currency.format(total)} excl. VAT`,
      '',
      'Name / company: ',
      'Org number / VAT ID: ',
      'Country and billing address: ',
      'Contact phone: ',
      'Event name: ',
      'Event date(s): ',
      'Venue or city: ',
      'Event website or social link: ',
      ...(community ? ['How the entry fee is used (community discount only): '] : []),
    ];
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }, [quote, tools, useType, period, seats, seatsValid, community, total]);

  // "Need help?" mail: works in every state, pre-filled with what's chosen so far.
  const helpHref = useMemo(() => {
    const chosenTools = toolOrder.filter((t) => tools.has(t)).map((t) => toolLabels[t]);
    const detail =
      quote.kind === 'price'
        ? `${quote.option === 'platform' ? 'Platform' : 'Servers'} license, ${periodLabels[period]}${seatsValid ? `, ${seats} seats` : ''}`
        : seatsValid && chosenTools.length > 0
          ? `${seats} seats`
          : '';
    const subject = detail ? `Help with a license: ${detail}` : 'Help with a license';
    const useLabel =
      useType === 'nonprofit' ? 'non-profit' : useType === 'personal' ? 'personal' : community ? 'community event' : 'commercial';
    const lines = [
      "Hi, I'd like help working out the right license for my setup.",
      '',
      'Event (name, dates, website): ',
      `Servers, spares included: ${seatsValid ? seats : ''}`,
      `Tools (MatchZy Enhanced, CS2 Server Manager, Ready Up, platform): ${chosenTools.join(', ')}`,
      `Commercial, community event or non-profit: ${useLabel}`,
      'Company name: ',
      'Org number / VAT ID: ',
      'Billing address: ',
    ];
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }, [quote, tools, useType, period, seats, seatsValid, community]);

  return (
    <Box
      id="calculator"
      sx={{
        bgcolor: color.paper2,
        border: `1px solid ${color.rule}`,
        borderRadius: `${radius.lg}px`,
        p: { xs: 2.5, md: 3.5 },
        display: 'grid',
        gap: 3,
      }}
    >
      <Typography variant="h3" sx={{ fontSize: '1.375rem' }}>
        Work out your price
      </Typography>

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Box
          component="fieldset"
          id={toolsId}
          sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
        >
          <Typography component="legend" sx={{ fontWeight: 600, mb: 0.5, p: 0 }}>
            What will you run?
          </Typography>
          <Box sx={{ display: 'grid' }}>
            {toolOrder.map((tool) => (
              <FormControlLabel
                key={tool}
                control={
                  <Checkbox
                    checked={tools.has(tool)}
                    onChange={() => toggleTool(tool)}
                  />
                }
                label={toolLabels[tool]}
              />
            ))}
          </Box>
        </Box>

        <Box
          component="fieldset"
          id={useTypeId}
          sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
        >
          <Typography component="legend" sx={{ fontWeight: 600, mb: 0.5, p: 0 }}>
            Use
          </Typography>
          <RadioGroup
            value={useType}
            onChange={(e) => setUseType(e.target.value as UseType)}
          >
            {useTypeOrder.map((ut) => (
              <FormControlLabel key={ut} value={ut} control={<Radio />} label={useTypeLabels[ut]} />
            ))}
          </RadioGroup>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Box component="fieldset" id={periodId} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
          <Typography component="legend" sx={{ fontWeight: 600, mb: 0.5, p: 0 }}>
            Period
          </Typography>
          <RadioGroup value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <FormControlLabel value="event" control={<Radio />} label={periodLabels.event} />
            <FormControlLabel value="yearly" control={<Radio />} label={periodLabels.yearly} />
          </RadioGroup>
        </Box>

        <Box>
          <TextField
            id={seatsId}
            label="Seats"
            type="number"
            value={seatsInput}
            onChange={(e) => setSeatsInput(e.target.value)}
            slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }}
            error={!seatsValid}
            helperText={
              seatsValid
                ? 'Every game server you set up, spares included.'
                : 'Enter a whole number of 1 or more.'
            }
            size="small"
            sx={{ maxWidth: 220 }}
          />
        </Box>
      </Box>

      {useType === 'commercial' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <FormControlLabel
            control={
              <Checkbox
                id={communityId}
                checked={community}
                onChange={(e) => setCommunity(e.target.checked)}
              />
            }
            label="Community event, entry only covers costs (50% off)"
            sx={{ mr: 0 }}
          />
          <Tooltip title={communityEventHelp} enterTouchDelay={0} leaveTouchDelay={4000} arrow placement="top">
            <IconButton
              aria-label="Who counts as a community event?"
              size="small"
              sx={{
                width: 20,
                height: 20,
                p: 0,
                border: `1px solid ${color.rule}`,
                color: color.muted,
                fontSize: '0.6875rem',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ?
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <Box
        role="status"
        aria-live="polite"
        sx={{
          bgcolor: color.paper3,
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.md}px`,
          p: 2,
          display: 'grid',
          gap: 0.5,
        }}
      >
        {quote.kind === 'prompt' && (
          <Typography sx={{ color: color.muted }}>Tick what you plan to run.</Typography>
        )}

        {quote.kind === 'free' && (
          <Typography sx={{ fontWeight: 700, fontSize: '1.125rem' }}>{quote.reason}</Typography>
        )}

        {quote.kind === 'nonprofit-free' && (
          <Typography sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
            Free: non-profit organizations are covered by the license
          </Typography>
        )}

        {quote.kind === 'price' && (
          <>
            <Typography sx={{ color: color.ink2, fontSize: '0.875rem' }}>{quote.reason}</Typography>
            {seatsValid ? (
              <>
                <Typography sx={{ color: color.ink2 }}>
                  {seats} seats × {currency.format(quote.pricePerSeat)} = {currency.format(subtotal)}
                </Typography>
                {community && (
                  <Typography sx={{ color: color.ink2 }}>
                    −50% community discount: −{currency.format(discountAmount)}
                  </Typography>
                )}
                <Typography sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
                  Total: {currency.format(total)} excl. VAT
                </Typography>
              </>
            ) : (
              <Typography sx={{ color: color.muted }}>Enter a valid number of seats to see a price.</Typography>
            )}
          </>
        )}
      </Box>

      <Box>
        {quote.kind === 'price' && mailHref && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
            {cardAvailable && (
              <Button
                variant="contained"
                onClick={startCheckout}
                disabled={checkoutLoading}
                aria-busy={checkoutLoading}
                data-testid="buy-with-card"
              >
                {checkoutLoading ? 'Opening checkout…' : 'Buy with card'}
              </Button>
            )}
            <Button variant={cardAvailable ? 'outlined' : 'contained'} href={mailHref} data-testid="request-by-email">
              Request by email
            </Button>
          </Box>
        )}

        {quote.kind === 'price' && checkoutError && (
          <Typography role="alert" sx={{ mt: 1.5, color: color.ban, fontSize: '0.875rem' }}>
            {checkoutError}
          </Typography>
        )}

        {quote.kind === 'price' && seatsValid && seats > maxSeats && (
          <Typography sx={{ mt: 1.5, color: color.ink2, fontSize: '0.875rem' }}>
            Card checkout covers up to {maxSeats} seats. For more, request the license by email.
          </Typography>
        )}

        {quote.kind === 'free' && (
          <Typography sx={{ fontWeight: 600 }}>No license needed</Typography>
        )}

        {quote.kind === 'nonprofit-free' && (
          <Typography sx={{ color: color.ink2 }}>
            Free. If you&apos;d like written confirmation,{' '}
            <Box component="a" href={`mailto:${email}`} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
              email us
            </Box>
            .
          </Typography>
        )}

        {quote.kind === 'price' && (
          <Typography sx={{ mt: 1.5, color: color.muted, fontSize: '0.8125rem' }}>
            Secure checkout by Stripe. You&apos;ll get an invoice. We check every order before sending the license.
          </Typography>
        )}
      </Box>

      <Box
        component="section"
        aria-labelledby={helpId}
        data-testid="need-help"
        sx={{ borderTop: `1px solid ${color.rule}`, pt: 2.5, display: 'grid', gap: 1, justifyItems: 'start' }}
      >
        <Typography id={helpId} component="h4" sx={{ fontWeight: 600 }}>
          Need help or prefer an invoice?
        </Typography>
        <Typography sx={{ color: color.ink2, fontSize: '0.9375rem', maxWidth: '60ch' }}>
          Tell us about your setup (the event, how many servers, which tools) and we&apos;ll work out the price with you and send you an invoice instead of
          card payment.
        </Typography>
        <Button variant="outlined" href={helpHref} sx={{ mt: 0.5 }}>
          Email us about your setup
        </Button>
      </Box>
    </Box>
  );
}
