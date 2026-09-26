'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import {
  founderBadge,
  founderUpdateWarning,
  formatEuro,
  freeUseHelp,
  maxPackServers,
  periodLabels,
  periodPriceSuffix,
  toolLabels,
  toolOrder,
  useTypeLabels,
  useTypeOrder,
  vatNote,
  type Pack,
  type PackProduct,
  type Period,
  type ToolOption,
  type UseType,
} from '@/components/pricing';
import { links } from '@/components/links';
import { FreeLanConfirmation } from '@/components/FreeLanConfirmation';
import { checkoutToolFor, derivePack, deriveProduct, type CheckoutRequest } from '@/lib/checkout';
import { startCheckout } from '@/lib/startCheckout';

const { color, radius } = tokens;

const email = 'sivert@autotournament.gg';

type Quote =
  | { kind: 'prompt' }
  | { kind: 'free'; reason: string }
  | { kind: 'nonprofit-free' }
  | { kind: 'servers-needed'; product: PackProduct; reason: string }
  | { kind: 'price'; product: PackProduct; pack: Pack; reason: string }
  | { kind: 'contact'; product: PackProduct; reason: string };

/** Servers: null when the input isn't a whole number of 1 or more. */
function quoteFor(packs: readonly Pack[], useType: UseType, tools: Set<ToolOption>, servers: number | null): Quote {
  if (useType === 'noncommercial') {
    return { kind: 'free', reason: 'Free: nobody earns money from it, so it is non-commercial' };
  }
  if (useType === 'nonprofit') {
    return { kind: 'nonprofit-free' };
  }

  const checkoutTools = [...tools].map((t) => checkoutToolFor[t]);
  // Same derivation as /api/checkout, so the calculator and the server agree.
  const product = deriveProduct(checkoutTools);

  if (product === null) {
    if (tools.has('matchzy')) return { kind: 'free', reason: 'Free: MatchZy Enhanced is MIT, free for any use' };
    return { kind: 'prompt' };
  }

  const reason =
    product === 'platform'
      ? 'Platform pack: the platform includes CS2 Server Manager, Ready Up and the game packs used with it'
      : `Servers pack: ${[tools.has('serverManager') && 'CS2 Server Manager', tools.has('readyUp') && 'Ready Up'].filter(Boolean).join(' + ')}`;

  if (servers === null) return { kind: 'servers-needed', product, reason };
  const pack = derivePack(packs, checkoutTools, servers);
  if (!pack) return { kind: 'contact', product, reason };
  return { kind: 'price', product, pack, reason };
}

/**
 * `packs` come from the server (Stripe prices, or the pricing.ts fallback):
 * plain numbers only. `pricesAvailable` is false when those are the fallback
 * prices (no Stripe key, or Stripe unreachable): card checkout is off from
 * the start rather than only after a 503.
 */
export function PriceCalculator({ packs, pricesAvailable = true }: { packs: readonly Pack[]; pricesAvailable?: boolean }) {
  const [tools, setTools] = useState<Set<ToolOption>>(new Set());
  const [useType, setUseType] = useState<UseType>('commercial');
  const [period, setPeriod] = useState<Period>('event');
  const [serversInput, setServersInput] = useState('10');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // Card checkout switched off when prices are the fallback, or after the
  // server says so (503) mid-session.
  const [cardOff, setCardOff] = useState(!pricesAvailable);

  const toolsId = useId();
  const useTypeId = useId();
  const periodId = useId();
  const serversId = useId();
  const helpId = useId();

  const servers = Number.parseInt(serversInput, 10);
  const serversValid = Number.isInteger(servers) && servers >= 1 && String(servers) === serversInput.trim();

  const quote = useMemo(() => quoteFor(packs, useType, tools, serversValid ? servers : null), [packs, useType, tools, servers, serversValid]);

  const price = quote.kind === 'price' ? quote.pack.prices[period] : 0;

  // A new selection clears the last checkout error.
  useEffect(() => {
    setCheckoutError(null);
  }, [tools, useType, period, serversInput]);

  // Coming back from Stripe with the back button can restore this page from
  // the bfcache with the button still in its loading state.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setCheckoutLoading(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const cardAvailable = quote.kind === 'price' && useType === 'commercial' && !cardOff;

  const runCheckout = async () => {
    if (quote.kind !== 'price' || !cardAvailable || checkoutLoading) return;
    const payload: CheckoutRequest = {
      pack: quote.pack.id,
      period,
      servers,
      tools: toolOrder.filter((t) => tools.has(t)).map((t) => checkoutToolFor[t]),
      use: 'commercial',
    };
    setCheckoutLoading(true);
    setCheckoutError(null);
    const result = await startCheckout(payload);
    if (!result.ok) {
      if (result.cardOff) setCardOff(true);
      setCheckoutError(result.error);
      setCheckoutLoading(false);
    }
    // On success, window.location.assign has navigated away; stay loading.
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
    if (quote.kind !== 'price') return undefined;
    const toolsLabel = toolOrder.filter((t) => tools.has(t)).map((t) => toolLabels[t]).join(', ');
    const useLabel = useTypeLabels[useType];
    const periodLabel = periodLabels[period];
    const subject = `License request: ${quote.pack.name}, ${periodLabel}`;
    const lines = [
      `Pack: ${quote.pack.name} (up to ${quote.pack.maxServers} servers)`,
      `Tools: ${toolsLabel}`,
      `Use: ${useLabel}`,
      `Period: ${periodLabel}`,
      `Servers, spares included: ${servers}`,
      `Price: ${formatEuro(price)}. ${vatNote}`,
      '',
      'Name / company: ',
      'Org number / VAT ID: ',
      'Country and billing address: ',
      'Contact phone: ',
      'Event name: ',
      'Event date(s): ',
      'Venue or city: ',
      'Event website or social link: ',
    ];
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }, [quote, tools, useType, period, servers, price]);

  // "Need help?" mail: works in every state, pre-filled with what's chosen so far.
  const helpHref = useMemo(() => {
    const chosenTools = toolOrder.filter((t) => tools.has(t)).map((t) => toolLabels[t]);
    const detail =
      quote.kind === 'price'
        ? `${quote.pack.name}, ${periodLabels[period]}`
        : quote.kind === 'contact'
          ? `${servers} servers, custom quote`
          : serversValid && chosenTools.length > 0
            ? `${servers} servers`
            : '';
    const subject = detail ? `Help with a license: ${detail}` : 'Help with a license';
    const useLabel = useTypeLabels[useType];
    const lines = [
      "Hi, I'd like help working out the right license for my setup.",
      '',
      'Event (name, dates, website): ',
      `Servers, spares included: ${serversValid ? servers : ''}`,
      `Tools (MatchZy Enhanced, CS2 Server Manager, Ready Up, platform): ${chosenTools.join(', ')}`,
      `Use: ${useLabel}`,
      'Company name: ',
      'Org number / VAT ID: ',
      'Billing address: ',
    ];
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }, [quote, tools, useType, period, servers, serversValid]);

  return (
    <Box
      id="calculator"
      sx={{
        scrollMarginTop: 96,
        bgcolor: color.paper2,
        border: `1px solid ${color.rule}`,
        borderRadius: `${radius.lg}px`,
        p: { xs: 2.5, md: 3.5 },
        display: 'grid',
        gap: 3,
      }}
    >
      <Typography variant="h3" sx={{ fontSize: '1.375rem' }}>
        Find your pack
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
            {useTypeOrder.map((ut) =>
              ut === 'noncommercial' ? (
                <Box key={ut} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <FormControlLabel value={ut} control={<Radio />} label={useTypeLabels[ut]} sx={{ mr: 0 }} />
                  <Tooltip title={freeUseHelp} enterTouchDelay={0} leaveTouchDelay={6000} arrow placement="top">
                    <IconButton
                      aria-label="When is it free?"
                      size="small"
                      sx={{
                        width: 20,
                        height: 20,
                        p: 0,
                        flex: 'none',
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
              ) : (
                <FormControlLabel key={ut} value={ut} control={<Radio />} label={useTypeLabels[ut]} />
              ),
            )}
          </RadioGroup>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Box>
          <TextField
            id={serversId}
            label="Game servers"
            type="number"
            value={serversInput}
            onChange={(e) => setServersInput(e.target.value)}
            slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }}
            error={!serversValid}
            helperText={
              serversValid
                ? 'Most game servers set up at any one time, spares included.'
                : 'Enter a whole number of 1 or more.'
            }
            size="small"
            sx={{ maxWidth: 260 }}
          />
        </Box>

        <Box component="fieldset" id={periodId} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
          <Typography component="legend" sx={{ fontWeight: 600, mb: 0.5, p: 0 }}>
            Period
          </Typography>
          <RadioGroup value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <FormControlLabel value="event" control={<Radio />} label={periodLabels.event} />
            <FormControlLabel value="year" control={<Radio />} label={periodLabels.year} />
            <FormControlLabel value="founder" control={<Radio />} label={periodLabels.founder} />
          </RadioGroup>
        </Box>
      </Box>

      <Box
        role="status"
        aria-live="polite"
        data-testid="calculator-result"
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
            Free: charities, schools and universities, public research, public safety or health and environmental protection organizations, and government bodies
            are covered by the license, even when they charge entry
          </Typography>
        )}

        {quote.kind === 'servers-needed' && (
          <>
            <Typography sx={{ color: color.ink2, fontSize: '0.875rem' }}>{quote.reason}</Typography>
            <Typography sx={{ color: color.muted }}>Enter how many game servers you&apos;ll set up to see your pack.</Typography>
          </>
        )}

        {quote.kind === 'contact' && (
          <>
            <Typography sx={{ color: color.ink2, fontSize: '0.875rem' }}>{quote.reason}</Typography>
            <Typography data-testid="quote-pack" sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
              Contact us
            </Typography>
            <Typography sx={{ color: color.ink2 }}>
              More than {maxPackServers(packs)} servers is a custom quote. Email us about your setup and we&apos;ll price it with you.
            </Typography>
          </>
        )}

        {quote.kind === 'price' && (
          <>
            <Typography sx={{ color: color.ink2, fontSize: '0.875rem' }}>{quote.reason}</Typography>
            <Typography data-testid="quote-pack" sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
              {quote.pack.name}: <span data-testid="quote-price">{formatEuro(price)}</span> {periodPriceSuffix[period]}
            </Typography>
            <Typography sx={{ color: color.ink2 }}>
              Up to {quote.pack.maxServers} game servers set up at any one time, spares included. {vatNote}.
            </Typography>
            {period === 'founder' && (
              <Box sx={{ mt: 1, display: 'grid', gap: 0.75, justifyItems: 'start' }}>
                <Chip size="small" color="primary" label={founderBadge} />
                <Typography sx={{ color: color.ink2, fontSize: '0.875rem' }}>
                  Pay once. Every version released in the 12 months after you buy is yours to use commercially, for good. Renewing updates after
                  that is optional, at {formatEuro(quote.pack.prices.year)} a year.
                </Typography>
                <Typography sx={{ color: color.ink, fontSize: '0.875rem', fontWeight: 600 }}>{founderUpdateWarning}.</Typography>
              </Box>
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
                onClick={runCheckout}
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

        {quote.kind === 'contact' && (
          <Button variant="contained" href={helpHref} data-testid="contact-us">
            Contact us for a quote
          </Button>
        )}

        {quote.kind === 'price' && checkoutError && (
          <Typography role="alert" sx={{ mt: 1.5, color: color.ban, fontSize: '0.875rem' }}>
            {checkoutError}
          </Typography>
        )}

        {quote.kind === 'free' && (
          <Typography sx={{ fontWeight: 600 }}>No license needed</Typography>
        )}

        {quote.kind === 'free' && useType === 'noncommercial' && (
          <Box sx={{ mt: 1.5 }}>
            <FreeLanConfirmation compact />
          </Box>
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
            Secure checkout by Stripe. You&apos;ll get an invoice. We check every order before sending the license. For businesses and organizations only. By
            paying you accept the{' '}
            <Box component="a" href={links.terms} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
              Commercial License Terms
            </Box>{' '}
            and{' '}
            <Box component="a" href={links.termsOfSale} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
              Terms of Sale
            </Box>
            .
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
