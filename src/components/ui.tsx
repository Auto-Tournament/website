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

/**
 * Drives a scripted card: returns the current step (0..length) and a ref for
 * the card. Plays only while the card is on screen, holds on the last step,
 * then loops. With reduced motion it sits on the final step.
 */
export function useScript(
  length: number,
  { stepMs = 1600, firstMs = 900, holdMs = 4500, delayFor }: { stepMs?: number; firstMs?: number; holdMs?: number; delayFor?: (step: number) => number } = {},
) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [step, setStep] = useState(0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    const atEnd = step >= length;
    const wait = atEnd ? holdMs : step === 0 ? firstMs : (delayFor?.(step) ?? stepMs);
    const t = setTimeout(() => {
      if (atEnd) {
        setStep(0);
        setLoop((n) => n + 1);
      } else setStep(step + 1);
    }, wait);
    return () => clearTimeout(t);
  }, [step, visible, reduced, length, stepMs, firstMs, holdMs, delayFor]);

  return { ref, step: reduced ? length : step, reduced, loop };
}

/** Fades a value in whenever it changes (keyed remount). */
export const tickIn = {
  animation: `tickIn 400ms ${ease.out}`,
  '@keyframes tickIn': { from: { opacity: 0, transform: 'translateY(-4px)' }, to: { opacity: 1, transform: 'none' } },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const;
