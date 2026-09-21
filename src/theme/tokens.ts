/**
 * Auto Tournament design tokens.
 *
 * Source of truth for the website and, later, the app. OKLCH values are the
 * design intent; the hex values next to them are what MUI's colour helpers can
 * work with. Keep both in step when a colour changes.
 */
export const tokens = {
  color: {
    paper: '#100908', // oklch(15% 0.012 38)
    paper2: '#18110e', // oklch(18.5% 0.014 38)
    paper3: '#211815', // oklch(22% 0.016 38)
    ink: '#f4edeb', // oklch(95% 0.008 38)
    ink2: '#c4bcb9', // oklch(80% 0.010 38)
    muted: '#938a87', // oklch(64% 0.012 38)
    rule: '#322926', // oklch(29% 0.014 38)
    accent: '#ff6a3d', // brand orange, oklch(70% 0.19 38)
    accent2: '#fe8f5b', // oklch(76% 0.15 45), hover
    accentInk: '#140e0c', // text on accent
    focus: '#ff6b33',
    live: '#3fc168', // oklch(72% 0.17 150)
    pick: '#3fc168', // same green as live
    ban: '#f2645f', // oklch(67% 0.17 25)
    bloom: 'rgba(255, 106, 61, 0.22)',
    bloom2: 'rgba(230, 70, 50, 0.14)',
  },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  space: { xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '5rem', '4xl': '8rem' },
  ease: {
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',
    in: 'cubic-bezier(0.55, 0, 1, 0.45)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  },
  duration: { fast: 150, base: 240, slow: 600 },
} as const;
