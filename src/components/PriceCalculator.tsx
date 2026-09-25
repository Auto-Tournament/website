'use client';

import { useId, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import {
  communityDiscount,
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

const { color, radius } = tokens;

const email = 'sivert@autotournament.gg';

const currency = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

type Quote =
  | { kind: 'prompt' }
  | { kind: 'free'; reason: string }
  | { kind: 'nonprofit-free' }
  | { kind: 'price'; pricePerSeat: number; reason: string };

function quoteFor(useType: UseType, tools: Set<ToolOption>, period: Period): Quote {
  if (useType === 'personal') {
    return { kind: 'free', reason: 'Free: personal and non-commercial use' };
  }
  if (useType === 'nonprofit') {
    return { kind: 'nonprofit-free' };
  }

  const hasPlatform = tools.has('platform');
  const hasServerManager = tools.has('serverManager');
  const hasReadyUp = tools.has('readyUp');
  const hasMatchzy = tools.has('matchzy');

  if (hasPlatform) {
    return {
      kind: 'price',
      pricePerSeat: seatPrices.platform[period],
      reason: 'Platform rate: the platform includes CS2 Server Manager and Ready Up',
    };
  }

  if (hasServerManager || hasReadyUp) {
    const names = [hasServerManager && 'CS2 Server Manager', hasReadyUp && 'Ready Up'].filter(Boolean);
    const verb = names.length > 1 ? 'count once per seat' : 'counts per seat';
    return {
      kind: 'price',
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

  const toolsId = useId();
  const useTypeId = useId();
  const periodId = useId();
  const seatsId = useId();
  const communityId = useId();

  const seats = Number.parseInt(seatsInput, 10);
  const seatsValid = Number.isInteger(seats) && seats >= 1 && String(seats) === seatsInput.trim();

  const quote = useMemo(() => quoteFor(useType, tools, period), [useType, tools, period]);

  const subtotal = quote.kind === 'price' && seatsValid ? seats * quote.pricePerSeat : 0;
  const discountAmount = quote.kind === 'price' && community ? subtotal * communityDiscount : 0;
  const total = subtotal - discountAmount;

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
      'Country: ',
      'VAT ID: ',
      'Event date(s) or yearly start date: ',
    ];
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }, [quote, tools, useType, period, seats, seatsValid, community, total]);

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
        <FormControlLabel
          control={
            <Checkbox
              id={communityId}
              checked={community}
              onChange={(e) => setCommunity(e.target.checked)}
            />
          }
          label="Community event, entry only covers costs (50% off)"
        />
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
          <Button variant="contained" href={mailHref}>
            Request this license
          </Button>
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

        <Typography sx={{ mt: 1.5, color: color.muted, fontSize: '0.8125rem' }}>
          You&apos;ll get an invoice by email. Card payment is coming soon.
        </Typography>
      </Box>
    </Box>
  );
}
