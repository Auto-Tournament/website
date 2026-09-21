'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { ProductCard, mono, tickIn, useScript } from '../ui';

const { color, radius, ease } = tokens;

/**
 * After-match update: the result comes in, stats are saved, the rating moves,
 * the sparkline grows a point, and the tournament win lands as a trophy.
 */
const before = { rating: 1812, kd: '1.18', adr: '84.9', kast: '72%', tournaments: 13 };
const after = { rating: 1842, kd: '1.21', adr: '86.4', kast: '74%', tournaments: 14 };
const history = [44, 40, 42, 34, 36, 26, 30, 20, 22, 18];

// 0 idle · 1 result arrives · 2 stats saved · 3 rating counts up · 4 trophy
const LENGTH = 4;

/** Counts a number from `from` to `to` over ~900 ms when `run` turns true. */
function useCountUp(from: number, to: number, run: boolean) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!run) {
      setValue(from);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setValue(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run]);
  return value;
}

export function ProfileCard() {
  const { ref, step, reduced } = useScript(LENGTH, { stepMs: 1800 });
  const saved = step >= 2;
  const rating = useCountUp(before.rating, after.rating, step >= 3 && !reduced);
  const shownRating = reduced || step > 3 ? after.rating : rating;
  const s = saved ? after : before;
  const points = step >= 3 ? [...history, 12] : history;
  const path = points.map((y, i) => `${i ? 'L' : 'M'}${(i * 300) / 10} ${y}`).join(' ');

  const stats = [
    { value: shownRating.toLocaleString('en-US').replace(',', ' '), label: 'Rating', hot: step >= 3 },
    { value: s.kd, label: 'K/D' },
    { value: s.adr, label: 'ADR' },
    { value: s.kast, label: 'KAST' },
  ];

  return (
    <ProductCard ref={ref} aria-label="Example player profile updating after a match">
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box
          aria-hidden
          sx={{ width: 56, height: 56, flex: 'none', borderRadius: `${radius.md}px`, bgcolor: color.accent, color: color.accentInk, display: 'grid', placeItems: 'center', fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.375rem' }}
        >
          E
        </Box>
        <div>
          <Box sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1.125rem' }}>elkjop_enjoyer</Box>
          <Box key={s.tournaments} sx={{ color: color.muted, ...tickIn }}>
            Nordlys · {s.tournaments} tournaments
          </Box>
        </div>
      </Box>
      <Box
        key={step >= 1 ? 'result' : 'idle'}
        sx={{ ...tickIn, mt: 2.5, px: 1.5, py: 1, borderRadius: `${radius.sm}px`, bgcolor: color.paper3, fontSize: '0.8125rem', color: step >= 1 ? color.ink : color.muted, minHeight: 36 }}
      >
        {step >= 1 ? (
          <>
            Final: Nordlys 2–1 Polar · <Box component="span" sx={{ color: color.accent }}>{step >= 3 ? `rating +${after.rating - before.rating}` : 'saving stats…'}</Box>
          </>
        ) : (
          'Playing the Spring Cup final…'
        )}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(4, minmax(0,1fr))' }, gap: 1, mt: 1.5 }}>
        {stats.map((st) => (
          <Box
            key={st.label}
            sx={{ bgcolor: color.paper3, borderRadius: `${radius.sm}px`, p: 1.5, outline: `1px solid ${st.hot ? color.accent : 'transparent'}`, transition: `outline-color 400ms ${ease.out}` }}
          >
            <Box key={st.label === 'Rating' ? 'r' : st.value} sx={{ ...mono, ...(st.label === 'Rating' ? {} : tickIn), fontWeight: 600, fontSize: '1.125rem' }}>
              {st.value}
            </Box>
            <Box sx={{ color: color.muted, fontSize: '0.75rem' }}>{st.label}</Box>
          </Box>
        ))}
      </Box>
      <Box component="svg" viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden sx={{ display: 'block', width: '100%', height: 56, mt: 2 }}>
        <path d={path} fill="none" stroke={color.accent} strokeWidth={2} />
        {step >= 3 && <circle cx={300} cy={12} r={4} fill={color.accent} />}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2, minHeight: 26 }}>
        {step >= 4 && <Chip size="small" color="primary" label="Spring Cup 2026 · 1st" sx={tickIn} />}
        <Chip size="small" label="Winter LAN · 3rd" />
        <Chip size="small" label="Most clutches" />
      </Box>
    </ProductCard>
  );
}
