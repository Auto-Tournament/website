'use client';

import { createTheme } from '@mui/material/styles';
import { tokens } from './tokens';

const { color, radius, ease, duration } = tokens;

export const fontDisplay = 'var(--font-display), sans-serif';
export const fontBody = 'var(--font-body), sans-serif';
export const fontMono = 'var(--font-mono), monospace';

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'dark',
    primary: { main: color.accent, light: color.accent2, contrastText: color.accentInk },
    success: { main: color.live },
    background: { default: color.paper, paper: color.paper2 },
    text: { primary: color.ink, secondary: color.ink2, disabled: color.muted },
    divider: color.rule,
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
        'html, body': { overflowX: 'clip' },
        body: {
          backgroundImage: `radial-gradient(60rem 40rem at 50% -10%, ${color.bloom}, transparent 70%), radial-gradient(40rem 30rem at 90% 55%, ${color.bloom2}, transparent 70%)`,
          backgroundAttachment: 'fixed',
        },
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
          whiteSpace: 'nowrap',
          transition: `background-color ${duration.fast}ms ${ease.out}, box-shadow ${duration.base}ms ${ease.out}, transform ${duration.fast}ms ${ease.out}`,
          '&:active': { transform: 'translateY(1px)' },
        },
        contained: {
          '&:hover': { backgroundColor: color.accent2, boxShadow: `0 10px 30px -12px ${color.accent}` },
        },
        outlined: {
          borderColor: color.rule,
          color: color.ink,
          '&:hover': { borderColor: color.rule, backgroundColor: color.paper3 },
        },
        sizeSmall: { padding: '0.55rem 0.95rem' },
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
