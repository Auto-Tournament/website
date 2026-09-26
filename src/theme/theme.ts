'use client';

import { createTheme } from '@mui/material/styles';
import { colorVars, hex, tokens } from './tokens';

const { color, radius, ease, duration } = tokens;

export const fontDisplay = 'var(--font-display), sans-serif';
export const fontBody = 'var(--font-body), sans-serif';
export const fontMono = 'var(--font-mono), monospace';

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'dark',
    // MUI needs real colours here; ThemeLab overrides the --mui-palette-*
    // variables these produce when a different theme is picked.
    primary: { main: hex.accent, light: hex.accent2, contrastText: hex.accentInk },
    success: { main: hex.live },
    background: { default: hex.paper, paper: hex.paper2 },
    text: { primary: hex.ink, secondary: hex.ink2, disabled: hex.muted },
    divider: hex.rule,
  },
  shape: { borderRadius: radius.md },
  typography: {
    fontFamily: fontBody,
    h1: { fontFamily: fontDisplay, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, fontSize: 'clamp(2.6rem, 5.2vw + 1rem, 5.25rem)' },
    h2: { fontFamily: fontDisplay, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, fontSize: 'clamp(1.9rem, 2.2vw + 1rem, 2.75rem)' },
    h3: { fontFamily: fontDisplay, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, fontSize: '1.375rem' },
    subtitle1: { fontFamily: fontDisplay, fontWeight: 600, fontSize: '1rem' },
    body1: { lineHeight: 1.55 },
    body2: { lineHeight: 1.55 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  transitions: {
    easing: { easeOut: ease.out, easeIn: ease.in, easeInOut: ease.inOut, sharp: ease.out },
    duration: { shortest: duration.fast, shorter: duration.fast, short: duration.base, standard: duration.base, complex: duration.slow },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Default values for the --at-* colour variables every component uses.
        ':root': Object.fromEntries(Object.entries(colorVars).map(([key, name]) => [name, hex[key as keyof typeof hex]])),
        'html, body': { overflowX: 'clip' },
        html: { scrollBehavior: 'smooth', '@media (prefers-reduced-motion: reduce)': { scrollBehavior: 'auto' } },
        // Keep anchored sections clear of the floating nav.
        '[id]': { scrollMarginTop: '96px' },
        ':focus-visible': { outline: `2px solid ${color.focus}`, outlineOffset: 3 },
        'h1, h2, h3': { overflowWrap: 'anywhere', minWidth: 0 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: radius.pill,
          padding: '0.7rem 1.2rem',
          // Labels wrap rather than spill out of the pill on narrow screens;
          // the button grows taller and the text stays inside its padding.
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
          textAlign: 'center',
          lineHeight: 1.3,
          maxWidth: '100%',
          minHeight: 44,
          transition: `background-color ${duration.fast}ms ${ease.out}, transform ${duration.fast}ms ${ease.out}`,
          '&:active': { transform: 'translateY(1px)' },
        },
        contained: {
          '&:hover': { backgroundColor: color.accent2 },
        },
        outlined: {
          borderColor: color.rule,
          color: color.ink,
          '&:hover': { borderColor: color.rule, backgroundColor: color.paper3 },
        },
        sizeSmall: { padding: '0.55rem 0.95rem', minHeight: 36 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontFamily: fontMono, fontSize: '0.75rem', height: 26, backgroundColor: color.paper3, color: color.ink2 },
        colorPrimary: { backgroundColor: color.accent, color: color.accentInk },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
  },
});
