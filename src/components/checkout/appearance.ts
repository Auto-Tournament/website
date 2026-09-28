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
    fontLineHeight: '1.4',
    fontWeightNormal: '400',
    fontWeightMedium: '500',
    borderRadius: `${tokens.radius.sm}px`,
    spacingUnit: '4px',
    gridRowSpacing: '16px',
    gridColumnSpacing: '16px',
    focusBoxShadow: `0 0 0 1px ${hex.accent}`,
    focusOutline: 'none',
  },
  // Same numbers as inputSx / labelSx in CheckoutForm.tsx: 44 px tall
  // (10 px + 1 px border top and bottom around a 21 px line), fieldRule border,
  // accent border + 1 px ring on focus, ban when invalid.
  rules: {
    '.Label': { color: hex.ink2, fontSize: '13px', fontWeight: '500', lineHeight: '1.4', marginBottom: '6px' },
    '.Input': { border: `1px solid ${hex.fieldRule}`, backgroundColor: hex.paper, boxShadow: 'none', padding: '10px 12px', fontSize: '15px', lineHeight: '1.4', transition: 'border-color 150ms, box-shadow 150ms' },
    '.Input::placeholder': { color: hex.muted },
    '.Input:hover': { borderColor: hex.muted },
    '.Input:focus': { borderColor: hex.accent, boxShadow: `0 0 0 1px ${hex.accent}`, outline: 'none' },
    '.Input--invalid': { borderColor: hex.ban, boxShadow: 'none', color: hex.ink },
    '.Input--invalid:focus': { borderColor: hex.ban, boxShadow: `0 0 0 1px ${hex.ban}` },
    '.Error': { color: hex.ban, fontSize: '13px', lineHeight: '1.45', marginTop: '6px' },
    '.Tab': { border: `1px solid ${hex.fieldRule}`, backgroundColor: hex.paper, boxShadow: 'none', minHeight: '44px' },
    '.Tab:hover': { borderColor: hex.muted, color: hex.ink },
    '.Tab:focus': { borderColor: hex.accent, boxShadow: `0 0 0 1px ${hex.accent}` },
    '.Tab--selected': { borderColor: hex.accent, backgroundColor: hex.paper3, boxShadow: `0 0 0 1px ${hex.accent}` },
    '.TabLabel': { fontSize: '13px', fontWeight: '500' },
    '.Block': { backgroundColor: hex.paper, border: `1px solid ${hex.fieldRule}`, boxShadow: 'none' },
    '.AccordionItem': { backgroundColor: hex.paper, border: `1px solid ${hex.fieldRule}`, boxShadow: 'none' },
    '.CheckboxInput': { border: `1px solid ${hex.muted}`, backgroundColor: hex.paper },
    '.CheckboxInput--checked': { backgroundColor: hex.accent, borderColor: hex.accent },
  },
};
