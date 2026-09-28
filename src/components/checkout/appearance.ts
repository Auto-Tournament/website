/**
 * Stripe's Payment Element styled like our own fields (CheckoutForm.tsx):
 * the night theme with the site's colours, font and radius. Stripe renders it
 * in an iframe, so it can't read our CSS variables; the values come from
 * `hex` (the default theme). Geist loads from Google Fonts inside the iframe.
 */
import type { Appearance, CssFontSource } from '@stripe/stripe-js';
import { hex, tokens } from '@/theme/tokens';

export const stripeFonts: CssFontSource[] = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap' }];

export const stripeAppearance: Appearance = {
  theme: 'night',
  labels: 'above',
  variables: {
    colorPrimary: hex.accent,
    colorBackground: hex.paper,
    colorText: hex.ink,
    colorTextSecondary: hex.ink2,
    colorTextPlaceholder: hex.muted,
    colorIcon: hex.ink2,
    colorDanger: hex.ban,
    colorSuccess: hex.live,
    colorWarning: hex.warn,
    fontFamily: 'Geist, system-ui, sans-serif',
    fontSizeBase: '15px',
    fontWeightNormal: '400',
    fontWeightMedium: '500',
    borderRadius: `${tokens.radius.sm}px`,
    spacingUnit: '4px',
    gridRowSpacing: '16px',
    focusBoxShadow: `0 0 0 2px ${hex.focus}`,
    focusOutline: 'none',
  },
  rules: {
    '.Input': { border: `1px solid ${hex.rule}`, boxShadow: 'none', padding: '11px 12px' },
    '.Input:hover': { borderColor: hex.muted },
    '.Input:focus': { borderColor: hex.accent, boxShadow: `0 0 0 1px ${hex.accent}` },
    '.Input--invalid': { borderColor: hex.ban, boxShadow: 'none' },
    '.Label': { color: hex.ink2, fontSize: '13px', fontWeight: '500', marginBottom: '6px' },
    '.Error': { color: hex.ban, fontSize: '13px' },
    '.Tab': { border: `1px solid ${hex.rule}`, backgroundColor: hex.paper, boxShadow: 'none' },
    '.Tab:hover': { borderColor: hex.muted, color: hex.ink },
    '.Tab--selected': { borderColor: hex.accent, backgroundColor: hex.paper3, boxShadow: `0 0 0 1px ${hex.accent}` },
    '.Block': { backgroundColor: hex.paper, border: `1px solid ${hex.rule}`, boxShadow: 'none' },
    '.AccordionItem': { backgroundColor: hex.paper, border: `1px solid ${hex.rule}`, boxShadow: 'none' },
  },
};
