import Box, { type BoxProps } from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import type { CompatCheckStatus, CompatComponentStatus, CompatOverall } from '@/lib/compat/document';

const { color } = tokens;

export type CompatTone = 'pass' | 'warn' | 'fail' | 'checking' | 'none';

/**
 * The page's colour for a status: green pass, yellow for a warning or a
 * check still pending (static OK, live check pending), red fail, pulsing
 * blue while a run is checking, grey when there is no verdict.
 */
export function compatTone(status: CompatComponentStatus | CompatOverall | CompatCheckStatus): CompatTone {
  switch (status) {
    case 'pass':
      return 'pass';
    case 'warn':
    case 'pending':
      return 'warn';
    case 'fail':
      return 'fail';
    case 'checking':
      return 'checking';
    default:
      return 'none';
  }
}

/**
 * One colour for the newest verdict where there is only room for a dot (the
 * nav): the page's colours, except a run in progress shows yellow (no
 * verdict yet), and no data at all, or a failed read, shows grey.
 */
export function compatSummaryTone(overall: CompatOverall | null): CompatTone {
  if (overall === null) return 'none';
  return overall === 'checking' ? 'warn' : compatTone(overall);
}

export const compatToneColor: Record<CompatTone, string> = {
  pass: color.live,
  warn: color.warn,
  fail: color.ban,
  checking: color.info,
  none: color.muted,
};

/** A status dot. `checking` pulses (a ring that grows and fades), unless the viewer asked for reduced motion. */
export function CompatDot({ tone, size = 10, sx, ...rest }: { tone: CompatTone; size?: number; sx?: BoxProps['sx']; 'data-testid'?: string }) {
  const fill = compatToneColor[tone];
  return (
    <Box
      component="span"
      aria-hidden
      data-tone={tone}
      data-testid={rest['data-testid']}
      sx={[
        {
          position: 'relative',
          display: 'inline-block',
          width: size,
          height: size,
          flex: 'none',
          borderRadius: '50%',
          bgcolor: fill,
          boxShadow: tone === 'none' ? 'none' : `0 0 0 ${Math.max(2, Math.round(size / 4))}px color-mix(in srgb, ${fill} 20%, transparent)`,
        },
        tone === 'checking' && {
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `2px solid ${fill}`,
            animation: 'compatPulse 1.6s ease-out infinite',
          },
          '@keyframes compatPulse': {
            '0%': { transform: 'scale(1)', opacity: 0.9 },
            '100%': { transform: 'scale(2.6)', opacity: 0 },
          },
          '@media (prefers-reduced-motion: reduce)': { '&::after': { animation: 'none', opacity: 0 } },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
