'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import {
  formatEuro,
  founderBadge,
  founderClosedBadge,
  founderPitch,
  founderShutdownPromise,
  founderUpdateWarning,
  founderUpgradeExample,
  maxPackServers,
  packGoodFor,
  popularSize,
  productIntro,
  vatNote,
  type Pack,
  type PackProduct,
  type Period,
} from '@/components/pricing';
import { links } from '@/components/links';
import { checkoutToolFor, type CheckoutRequest, type CheckoutTool } from '@/lib/checkout';
import { useCheckout } from '@/components/checkout/Checkout';
import { seller } from '@/components/seller';

const { color, radius } = tokens;

const products: PackProduct[] = ['servers', 'platform'];

/** A pack's tools for checkout: Servers packs are 'csm', Platform packs are 'platform'. */
function toolsFor(product: PackProduct): CheckoutTool[] {
  return product === 'platform' ? [checkoutToolFor.platform] : [checkoutToolFor.serverManager];
}

/** Which button is currently loading, so only that one shows the loading label. */
type LoadingKey = `${string}:${Period}`;
const loadingKeyFor = (packId: string, period: Period): LoadingKey => `${packId}:${period}`;

/**
 * A founding supporter button holds two lines (pack, then price), so it is a
 * rounded card rather than a pill, and its text wraps instead of spilling out.
 */
const founderButton = {
  display: 'grid',
  justifyItems: 'center',
  alignContent: 'center',
  gap: 0.25,
  py: 1,
  px: 1.5,
  minWidth: 0,
  height: 'auto',
  borderRadius: `${radius.md}px`,
  textAlign: 'center',
  lineHeight: 1.25,
} as const;

/**
 * The top of the pricing page: Servers / Platform toggle, the S / M / L pack
 * cards, and the founding supporter strip. Every Buy button starts Stripe
 * Checkout for that pack and period through useCheckout (the embedded dialog,
 * or hosted Checkout as a fallback).
 *
 * `allPacks` comes from the server (Stripe prices, or the pricing.ts
 * fallback): plain numbers only. `pricesAvailable` is false when those are
 * the fallback prices: the buy buttons are hidden in favor of "Request by
 * email", since checkout can't charge a price that didn't come from Stripe.
 */
export function PackPricing({
  packs: allPacks,
  pricesAvailable = true,
  founderOpen = true,
}: {
  packs: readonly Pack[];
  pricesAvailable?: boolean;
  founderOpen?: boolean;
}) {
  const [product, setProduct] = useState<PackProduct>('servers');
  // #packs-servers and #packs-platform (the setup cards on the pricing page) open that product.
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'packs-servers') setProduct('servers');
      if (hash === 'packs-platform') setProduct('platform');
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  const [loadingKey, setLoadingKey] = useState<LoadingKey | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const packs = allPacks.filter((p) => p.product === product);

  const { buy: startBuy } = useCheckout();

  const buy = async (pack: Pack, period: Period) => {
    if (loadingKey) return;
    const key = loadingKeyFor(pack.id, period);
    setLoadingKey(key);
    setErrors((prev) => ({ ...prev, [pack.id]: '' }));
    const payload: CheckoutRequest = {
      pack: pack.id,
      period,
      servers: pack.maxServers,
      tools: toolsFor(pack.product),
      use: 'commercial',
    };
    const outcome = await startBuy({ payload, packName: pack.name, maxServers: pack.maxServers, period, price: pack.prices[period] });
    // Going to hosted Checkout: stay loading while the browser navigates.
    if (outcome.kind === 'redirecting') return;
    setLoadingKey(null);
    if (outcome.kind === 'failed' && !outcome.shownInDialog) {
      setErrors((prev) => ({ ...prev, [pack.id]: outcome.error }));
    }
  };

  return (
    // minmax(0, 1fr): the column may shrink below its content's widest line, so the cards fit a 320 px screen.
    <Box sx={{ display: 'grid', gap: { xs: 3, md: 4 }, gridTemplateColumns: 'minmax(0, 1fr)' }}>
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
          const cardError = errors[pack.id];
          const eventLoading = loadingKey === loadingKeyFor(pack.id, 'event');
          const yearLoading = loadingKey === loadingKeyFor(pack.id, 'year');
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
                {popular && <Chip size="small" color="primary" label="Recommended" />}
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

              <Box sx={{ display: 'grid', gap: 1, mt: 0.5 }}>
                {pricesAvailable ? (
                  <>
                    <Button
                      variant={popular ? 'contained' : 'outlined'}
                      onClick={() => buy(pack, 'event')}
                      disabled={loadingKey !== null}
                      aria-busy={eventLoading}
                      aria-label={`Buy ${pack.name} for one event, ${formatEuro(pack.prices.event)}`}
                      data-testid="buy-event"
                    >
                      {eventLoading ? (
                        'Opening checkout…'
                      ) : (
                        <>
                          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                            Buy for one event · {formatEuro(pack.prices.event)}
                          </Box>
                          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                            One event · {formatEuro(pack.prices.event)}
                          </Box>
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => buy(pack, 'year')}
                      disabled={loadingKey !== null}
                      aria-busy={yearLoading}
                      aria-label={`Buy ${pack.name} yearly, ${formatEuro(pack.prices.year)}`}
                      data-testid="buy-year"
                    >
                      {yearLoading ? (
                        'Opening checkout…'
                      ) : (
                        <>
                          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                            Buy yearly · {formatEuro(pack.prices.year)}
                          </Box>
                          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                            Yearly · {formatEuro(pack.prices.year)}
                          </Box>
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant={popular ? 'contained' : 'outlined'}
                    href={`mailto:${seller.email}`}
                    aria-label={`Request ${pack.name} by email`}
                    data-testid="request-by-email"
                  >
                    Request by email
                  </Button>
                )}
                {cardError && (
                  <Typography role="alert" sx={{ color: color.ban, fontSize: '0.8125rem' }}>
                    {cardError}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ color: color.muted, fontSize: '0.875rem', mt: -1 }}>
        Spares count toward the servers. More than {maxPackServers(allPacks)} servers?{' '}
        <Box component="a" href={`${links.contact}?topic=quote`} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
          Contact us
        </Box>{' '}
        for a quote. Prices in EUR. {vatNote}
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
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
          <Typography id="founding-supporter-title" component="h3" sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1.125rem' }}>
            Founding supporter
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={founderOpen ? founderBadge : founderClosedBadge}
            data-testid="founder-badge"
            // The badge text is long: let it wrap on narrow phones instead of widening the strip.
            sx={{ maxWidth: '100%', height: 'auto', py: 0.25, '& .MuiChip-label': { whiteSpace: 'normal' } }}
          />
        </Box>
        <Typography sx={{ color: color.ink2, maxWidth: '62ch' }}>
          {founderPitch}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(3, minmax(0,1fr))' }, gap: 1, maxWidth: 560 }}>
          {packs.map((pack) => {
            const founderLoading = loadingKey === loadingKeyFor(pack.id, 'founder');
            return pricesAvailable ? (
              <Button
                key={pack.id}
                variant="outlined"
                onClick={() => buy(pack, 'founder')}
                disabled={loadingKey !== null || !founderOpen}
                aria-busy={founderLoading}
                aria-label={`Become a founding supporter with ${pack.name}, ${formatEuro(pack.prices.founder)}`}
                data-testid="founder-price"
                sx={founderButton}
              >
                <Box component="span" sx={{ fontSize: '0.8125rem', color: color.ink2, fontWeight: 500 }}>
                  {pack.size} · {pack.maxServers} servers
                </Box>
                <Box component="span" sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '1rem', color: color.ink }}>
                  {!founderOpen ? 'Sold out' : founderLoading ? 'Opening checkout…' : `Pay once · ${formatEuro(pack.prices.founder)}`}
                </Box>
              </Button>
            ) : (
              <Button
                key={pack.id}
                variant="outlined"
                href={`mailto:${seller.email}`}
                aria-label={`Request ${pack.name} as a founding supporter by email`}
                data-testid="request-by-email"
                sx={founderButton}
              >
                <Box component="span" sx={{ fontSize: '0.8125rem', color: color.ink2, fontWeight: 500 }}>
                  {pack.size} · {pack.maxServers} servers
                </Box>
                <Box component="span" sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '1rem', color: color.ink }}>
                  Request by email
                </Box>
              </Button>
            );
          })}
        </Box>
        <Typography sx={{ color: color.ink2, fontSize: '0.9375rem', maxWidth: '62ch' }}>
          The pack size is fixed; a bigger size costs the difference ({founderUpgradeExample(allPacks, product)}). {founderShutdownPromise}
        </Typography>
        <Typography sx={{ color: color.ink, fontSize: '0.9375rem', fontWeight: 600 }}>{founderUpdateWarning}.</Typography>
        <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>
          <Box component="a" href="#founder-terms" sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
            Founding supporter terms
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}
