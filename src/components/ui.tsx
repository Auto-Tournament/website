'use client';

import { useEffect, useRef, useState } from 'react';
import Box, { type BoxProps } from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { tokens } from '@/theme/tokens';
import { fontDisplay, fontMono } from '@/theme/theme';

const { color, radius, ease, duration } = tokens;

/** Fades children in once they scroll into view. Honours reduced motion. */
export function Reveal({ delay = 0, sx, ...props }: BoxProps & { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Box
      ref={ref}
      sx={{
        opacity: shown ? 1 : 0,
        transition: `opacity ${duration.slow}ms ${ease.out} ${delay}ms`,
        '@media (prefers-reduced-motion: reduce)': { opacity: 1, transition: 'none' },
        ...sx,
      }}
      {...props}
    />
  );
}

/** Product card surface used for every in-page UI preview. */
export function ProductCard({ sx, ...props }: BoxProps) {
  return (
    <Box
      sx={{
        bgcolor: color.paper2,
        border: `1px solid ${color.rule}`,
        borderRadius: `${radius.lg}px`,
        p: 3,
        fontSize: '0.875rem',
        transition: `transform ${duration.base}ms ${ease.out}, box-shadow ${duration.base}ms ${ease.out}`,
        '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 24px 60px -30px ${color.accent}` },
        '@media (prefers-reduced-motion: reduce)': { '&:hover': { transform: 'none' } },
        ...sx,
      }}
      {...props}
    />
  );
}

export function CardHead({ title, tag }: { title: string; tag: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 2 }}>
      <Box sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1rem' }}>{title}</Box>
      {tag}
    </Box>
  );
}

export function LiveChip({ label = 'Live' }: { label?: string }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        color: color.live,
        '&::before': { content: '""', width: 6, height: 6, borderRadius: '50%', bgcolor: color.live, ml: 1 },
      }}
    />
  );
}

export const mono = { fontFamily: fontMono } as const;
