'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { ProductCard, mono } from '../ui';

const { color, radius } = tokens;

const stats = [
  { value: '1 842', label: 'Rating' },
  { value: '1.21', label: 'K/D' },
  { value: '86.4', label: 'ADR' },
  { value: '74%', label: 'KAST' },
];

// The rating graph: a random walk that scrolls left forever, trending upward
// on average (seeding gets fairer as history builds up).
const POINTS = 12;
const STEP_X = 300 / (POINTS - 1);
const TICK_MS = 1400;
const initial = [44, 40, 42, 34, 36, 28, 32, 22, 26, 20, 24, 18];

const nextY = (y: number) => Math.max(8, Math.min(48, y + (Math.random() - 0.55) * 14));

function RatingGraph() {
  const ref = useRef<SVGSVGElement>(null);
  const [points, setPoints] = useState(initial);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);

  // Scroll only while on screen and when motion is welcome.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([e]) => setRunning(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setPoints((p) => [...p.slice(1), nextY(p[p.length - 1])]);
      setTick((n) => n + 1);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [running]);

  // Draw one extra point off the right edge; each tick the path slides left by
  // one step, then the data shifts and the slide restarts, so it moves smoothly.
  const drawn = [...points, points[points.length - 1]];
  const d = drawn.map((y, i) => `${i ? 'L' : 'M'}${(i * STEP_X).toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const lastX = (POINTS - 1) * STEP_X;

  return (
    <Box component="svg" ref={ref} viewBox={`0 0 300 56`} preserveAspectRatio="none" aria-hidden sx={{ display: 'block', width: '100%', height: 56, mt: 2, overflow: 'hidden' }}>
      <g
        key={tick}
        style={
          running
            ? { animation: `graphSlide ${TICK_MS}ms linear forwards` }
            : undefined
        }
      >
        <path d={d} fill="none" style={{ stroke: color.accent }} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </g>
      <circle cx={lastX} cy={points[points.length - 1]} r={3.5} style={{ fill: color.accent }} />
      <style>{`@keyframes graphSlide { from { transform: translateX(0) } to { transform: translateX(-${STEP_X.toFixed(1)}px) } }`}</style>
    </Box>
  );
}

export function ProfileCard() {
  return (
    <ProductCard aria-label="Example player profile">
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box
          aria-hidden
          sx={{ width: 56, height: 56, flex: 'none', borderRadius: `${radius.md}px`, bgcolor: color.accent, color: color.accentInk, display: 'grid', placeItems: 'center', fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.375rem' }}
        >
          E
        </Box>
        <div>
          <Box sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1.125rem' }}>elkjop_enjoyer</Box>
          <Box sx={{ color: color.muted }}>Nordlys · 14 tournaments</Box>
        </div>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(4, minmax(0,1fr))' }, gap: 1, mt: 3 }}>
        {stats.map((s) => (
          <Box key={s.label} sx={{ bgcolor: color.paper3, borderRadius: `${radius.sm}px`, p: 1.5 }}>
            <Box sx={{ ...mono, fontWeight: 600, fontSize: '1.125rem' }}>{s.value}</Box>
            <Box sx={{ color: color.muted, fontSize: '0.75rem' }}>{s.label}</Box>
          </Box>
        ))}
      </Box>
      <RatingGraph />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
        <Chip size="small" color="primary" label="Spring Cup 2026 · 1st" />
        <Chip size="small" label="Winter LAN · 3rd" />
        <Chip size="small" label="Most clutches" />
      </Box>
    </ProductCard>
  );
}
