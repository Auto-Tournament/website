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
  usageLabels,
  type Period,
  type UsageOption,
} from '@/components/pricing';

const { color, radius } = tokens;

const email = 'sivert@autotournament.gg';

const currency = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export function PriceCalculator() {
  const [usage, setUsage] = useState<UsageOption>('servers');
  const [period, setPeriod] = useState<Period>('event');
  const [seatsInput, setSeatsInput] = useState('10');
  const [community, setCommunity] = useState(false);

  const usageId = useId();
  const periodId = useId();
  const seatsId = useId();
  const communityId = useId();

  const seats = Number.parseInt(seatsInput, 10);
  const seatsValid = Number.isInteger(seats) && seats >= 1 && String(seats) === seatsInput.trim();

  const pricePerSeat = seatPrices[usage][period];
  const subtotal = seatsValid ? seats * pricePerSeat : 0;
  const discountAmount = community ? subtotal * communityDiscount : 0;
  const total = subtotal - discountAmount;

  const mailHref = useMemo(() => {
    if (!seatsValid) return undefined;
    const usageLabel = usageLabels[usage];
    const periodLabel = periodLabels[period];
    const subject = `License request: ${usageLabel}, ${periodLabel}, ${seats} seats`;
    const lines = [
      `Option: ${usageLabel}`,
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
  }, [usage, period, seats, seatsValid, community, total]);

  return (
    <Box
      sx={{
        bgcolor: color.paper2,
        border: `1px solid ${color.rule}`,
        borderRadius: `${radius.lg}px`,
        p: { xs: 2.5, md: 3.5 },
        display: 'grid',
        gap: 3,
      }}
    >
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Box>
          <Typography component="label" htmlFor={usageId} sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            What you use
          </Typography>
          <RadioGroup
            id={usageId}
            value={usage}
            onChange={(e) => setUsage(e.target.value as UsageOption)}
          >
            <FormControlLabel value="servers" control={<Radio />} label={usageLabels.servers} />
            <FormControlLabel value="platform" control={<Radio />} label={usageLabels.platform} />
          </RadioGroup>
        </Box>

        <Box>
          <Typography component="label" htmlFor={periodId} sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
            Period
          </Typography>
          <RadioGroup id={periodId} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <FormControlLabel value="event" control={<Radio />} label={periodLabels.event} />
            <FormControlLabel value="yearly" control={<Radio />} label={periodLabels.yearly} />
          </RadioGroup>
        </Box>
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
        {seatsValid ? (
          <>
            <Typography sx={{ color: color.ink2 }}>
              {seats} seats × {currency.format(pricePerSeat)} = {currency.format(subtotal)}
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
      </Box>

      <Box sx={{ display: 'grid', gap: 0.5 }}>
        <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>
          Only MatchZy Enhanced (MIT), without CS2 Server Manager? Free.
        </Typography>
        <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>
          Non-profit organizations are free: email us.
        </Typography>
      </Box>

      <Box>
        <Button
          variant="contained"
          href={mailHref}
          aria-disabled={!mailHref}
          onClick={(e) => {
            if (!mailHref) e.preventDefault();
          }}
        >
          Request this license
        </Button>
        <Typography sx={{ mt: 1.5, color: color.muted, fontSize: '0.8125rem' }}>
          You&apos;ll get an invoice by email. Card payment is coming soon.
        </Typography>
      </Box>
    </Box>
  );
}
