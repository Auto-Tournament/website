'use client';

import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import {
  PACKS,
  formatEuro,
  founderBadge,
  founderUpdateWarning,
  maxPackServers,
  packGoodFor,
  popularSize,
  productIntro,
  vatNote,
  type Pack,
  type PackProduct,
  type Period,
} from '@/components/pricing';
import { PriceCalculator, type PickerPreset } from '@/components/PriceCalculator';

const { color, radius } = tokens;

const products: PackProduct[] = ['servers', 'platform'];

/**
 * The top of the pricing page: Servers / Platform toggle, the S / M / L pack
 * cards, the founding supporter strip, and the pack picker. "Buy" on a card
 * preselects that pack in the picker and moves focus there.
 */
export function PackPricing() {
  const [product, setProduct] = useState<PackProduct>('servers');
  const [preset, setPreset] = useState<PickerPreset | undefined>(undefined);

  const packs = PACKS.filter((p) => p.product === product);

  const pick = useCallback((pack: Pack, period: Period) => {
    setPreset((prev) => ({ product: pack.product, servers: pack.maxServers, period, key: (prev?.key ?? 0) + 1 }));
  }, []);

  return (
    <Box sx={{ display: 'grid', gap: { xs: 3, md: 4 } }}>
      <Box sx={{ display: 'grid', gap: 1.5, justifyItems: 'start' }}>
        <ToggleButtonGroup
          exclusive
          value={product}
          onChange={(_e, next: PackProduct | null) => next && setProduct(next)}
          aria-label="What you run"
          data-testid="product-toggle"
          sx={{
            bgcolor: color.paper2,
            border: `1px solid ${color.rule}`,
            borderRadius: `${radius.pill}px`,
            p: 0.5,
            gap: 0.5,
            '& .MuiToggleButtonGroup-grouped': {
              border: 0,
              borderRadius: `${radius.pill}px !important`,
              m: 0,
            },
          }}
        >
          {products.map((p) => (
            <ToggleButton
              key={p}
              value={p}
              sx={{
                px: { xs: 2.5, sm: 3.5 },
                py: 1,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                whiteSpace: 'nowrap',
                color: color.ink2,
                '&.Mui-selected, &.Mui-selected:hover': { bgcolor: color.accent, color: color.accentInk },
                '&.Mui-focusVisible': { outline: `2px solid ${color.focus}`, outlineOffset: 2 },
              }}
            >
              {productIntro[p].title}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography data-testid="product-line" sx={{ color: color.ink2, maxWidth: '60ch' }}>
          {productIntro[product].line}
        </Typography>
      </Box>

      <Box
        data-testid="pack-cards"
        sx={{ display: 'grid', gap: { xs: 2, md: 2.5 }, gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(3, minmax(0,1fr))' } }}
      >
        {packs.map((pack) => {
          const popular = pack.size === popularSize;
          return (
            <Box
              key={pack.id}
              component="article"
              data-pack={pack.id}
              aria-labelledby={`${pack.id}-name`}
              sx={{
                position: 'relative',
                bgcolor: color.paper2,
                border: `1px solid ${popular ? color.accent : color.rule}`,
                borderRadius: `${radius.lg}px`,
                p: { xs: 2.5, md: 3 },
                display: 'grid',
                gridTemplateRows: 'auto auto 1fr auto auto',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 28 }}>
                <Typography id={`${pack.id}-name`} component="h3" sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1.125rem' }}>
                  {pack.name}
                </Typography>
                {popular && <Chip size="small" color="primary" label="Most popular" />}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Box component="span" sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: { xs: '3rem', md: '3.5rem' }, lineHeight: 1, letterSpacing: '-0.03em' }}>
                  {pack.maxServers}
                </Box>
                <Box component="span" sx={{ color: color.ink2 }}>
                  game servers max
                </Box>
              </Box>

              <Typography sx={{ color: color.muted, fontSize: '0.9375rem' }}>Good for: {packGoodFor[pack.size]}</Typography>

              <Box sx={{ borderTop: `1px solid ${color.rule}`, pt: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                  <Box component="span" data-testid="card-event-price" sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '2rem', lineHeight: 1.1 }}>
                    {formatEuro(pack.prices.event)}
                  </Box>
                  <Box component="span" sx={{ color: color.ink2 }}>
                    per event
                  </Box>
                </Box>
                <Typography sx={{ color: color.muted, fontSize: '0.9375rem', mt: 0.25 }}>
                  or {formatEuro(pack.prices.year)} a year, unlimited events
                </Typography>
              </Box>

              <Button
                variant={popular ? 'contained' : 'outlined'}
                onClick={() => pick(pack, 'event')}
                aria-label={`Buy ${pack.name}`}
                sx={{ whiteSpace: 'nowrap', mt: 0.5 }}
              >
                Buy
              </Button>
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ color: color.muted, fontSize: '0.875rem', mt: -1 }}>
        Spares count toward the servers. More than {maxPackServers} servers? Contact us for a quote. Prices in EUR. {vatNote}.
      </Typography>

      <Box
        component="section"
        id="founding-supporter"
        aria-labelledby="founding-supporter-title"
        data-testid="founder-strip"
        sx={{
          bgcolor: color.paper3,
          border: `1px solid ${color.rule}`,
          borderLeft: `3px solid ${color.accent}`,
          borderRadius: `${radius.md}px`,
          p: { xs: 2.5, md: 3 },
          display: 'grid',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
          <Typography id="founding-supporter-title" component="h3" sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1.125rem' }}>
            Founding supporter
          </Typography>
          <Chip size="small" variant="outlined" label={founderBadge} data-testid="founder-badge" />
        </Box>
        <Typography sx={{ color: color.ink2, maxWidth: '62ch' }}>
          Pay once. Use every version released in the 12 months after you buy commercially, for good, with 1 year of updates included.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 1, maxWidth: 480 }}>
          {packs.map((pack) => (
            <Button
              key={pack.id}
              variant="outlined"
              onClick={() => pick(pack, 'founder')}
              aria-label={`Buy ${pack.name} as a founding supporter, ${formatEuro(pack.prices.founder)}`}
              data-testid="founder-price"
              sx={{ display: 'grid', justifyItems: 'center', gap: 0.25, py: 1, px: 1, whiteSpace: 'nowrap', minWidth: 0 }}
            >
              <Box component="span" sx={{ fontSize: '0.8125rem', color: color.ink2, fontWeight: 500 }}>
                {pack.size} · {pack.maxServers} servers
              </Box>
              <Box component="span" sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.25rem', color: color.ink }}>
                {formatEuro(pack.prices.founder)}
              </Box>
            </Button>
          ))}
        </Box>
        <Typography sx={{ color: color.ink2, fontSize: '0.9375rem', maxWidth: '62ch' }}>
          After a year, renewing updates is optional, at the yearly price of the same pack (for example {formatEuro(packs[2].prices.year)} a year for{' '}
          {packs[2].name}). Without it, you keep the versions from your first 12 months.
        </Typography>
        <Typography sx={{ color: color.ink, fontSize: '0.9375rem', fontWeight: 600 }}>{founderUpdateWarning}.</Typography>
        <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>
          <Box component="a" href="#founder-terms" sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
            Founding supporter terms
          </Box>
        </Typography>
      </Box>

      <PriceCalculator preset={preset} />
    </Box>
  );
}
