import { hex as emberHex, colorVars, type ThemeColors } from './tokens';

/**
 * Turn a small palette (the 3–5 swatches palette sites give you) into a full
 * set of theme colours.
 *
 * The most colourful swatch becomes the accent. The neutrals (page, surfaces,
 * rules, text) are generated at fixed OKLCH lightness steps so every theme
 * keeps the same contrast, tinted with the hue of the palette's dark swatch.
 */

type Oklch = { l: number; c: number; h: number };

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function hexToRgb(value: string): [number, number, number] {
  const h = value.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp(c) * 255);
};

export function toOklch(value: string): Oklch {
  const [r, g, b] = hexToRgb(value).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

/** OKLCH to hex, pulling chroma in until the colour fits sRGB. */
export function fromOklch(color: Oklch): string {
  let c = color.c;
  let rgb = oklchToLinear({ ...color, c });
  while (c > 0 && rgb.some((v) => v < -0.0005 || v > 1.0005)) {
    c -= 0.005;
    rgb = oklchToLinear({ ...color, c: Math.max(0, c) });
  }
  return `#${rgb.map((v) => fromLinear(v).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(value: string) {
  const [r, g, b] = hexToRgb(value).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function rgba(value: string, alpha: number) {
  const [r, g, b] = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Every #rgb / #rrggbb in a string, e.g. pasted from a palette site. */
export function parseColors(text: string): string[] {
  return (text.match(/#?\b[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? []).map((c) => `#${c.replace('#', '').toLowerCase()}`);
}

export type DeriveOptions = {
  /** Index of the swatch to use as the accent; defaults to the most colourful. */
  accent?: number;
};

export function deriveTheme(colors: string[], options: DeriveOptions = {}): ThemeColors {
  if (colors.length === 0) return { ...emberHex };
  const swatches = colors.map((value, index) => ({ value, index, ...toOklch(value) }));

  // Accent: the chosen swatch, or the most colourful one that isn't near-black.
  const byChroma = [...swatches].sort((a, b) => b.c - a.c);
  const accent =
    swatches[options.accent ?? -1] ?? byChroma.find((s) => s.l > 0.35) ?? byChroma[0];

  // Hover/secondary accent: another colourful swatch close in hue, else a
  // lighter take on the accent.
  const partner = byChroma.find(
    (s) => s !== accent && s.c > 0.08 && s.l > 0.35 && hueDistance(s.h, accent.h) < 50,
  );
  const accent2 = partner ? partner.value : fromOklch({ l: clamp(accent.l + 0.08), c: accent.c * 0.9, h: accent.h });

  // Neutrals take the dark swatch's hue when it has one, else the accent's.
  const darkest = [...swatches].sort((a, b) => a.l - b.l)[0];
  const tinted = darkest.c > 0.015 && darkest !== accent;
  const hue = tinted ? darkest.h : accent.h;
  const chroma = clamp(tinted ? darkest.c * 0.6 : 0.014, 0.008, 0.035);
  const neutral = (l: number, c = chroma) => fromOklch({ l, c, h: hue });

  const paper = neutral(0.15);
  const ink = neutral(0.95, Math.min(chroma, 0.012));
  const accentInk = contrast(accent.value, '#ffffff') >= contrast(accent.value, paper) ? '#ffffff' : neutral(0.13);

  return {
    paper,
    paper2: neutral(0.185),
    paper3: neutral(0.22),
    ink,
    ink2: neutral(0.8, Math.min(chroma, 0.016)),
    muted: neutral(0.64, Math.min(chroma, 0.02)),
    rule: neutral(0.29),
    accent: accent.value,
    accent2,
    accentInk,
    focus: accent.value,
    live: emberHex.live,
    pick: emberHex.pick,
    ban: emberHex.ban,
    bloom: rgba(accent.value, 0.22),
    bloom2: rgba(accent2, 0.14),
    logoInk: neutral(0.2, Math.min(chroma, 0.03)),
    navGlass: rgba(neutral(0.185), 0.82),
  };
}

const channel = (value: string) => hexToRgb(value).join(' ');

/**
 * CSS custom properties for a theme: our --at-* tokens plus the MUI palette
 * variables MUI's own components and `sx` shorthands ('text.secondary') read.
 */
export function themeCssVars(theme: ThemeColors): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, name] of Object.entries(colorVars)) vars[name] = theme[key as keyof ThemeColors];
  const mui: Record<string, string> = {
    'primary-main': theme.accent,
    'primary-light': theme.accent2,
    'primary-dark': theme.accent,
    'primary-contrastText': theme.accentInk,
    'primary-mainChannel': channel(theme.accent),
    'primary-lightChannel': channel(theme.accent2),
    'primary-darkChannel': channel(theme.accent),
    'primary-contrastTextChannel': channel(theme.accentInk),
    'background-default': theme.paper,
    'background-paper': theme.paper2,
    'background-defaultChannel': channel(theme.paper),
    'background-paperChannel': channel(theme.paper2),
    'text-primary': theme.ink,
    'text-secondary': theme.ink2,
    'text-disabled': theme.muted,
    'text-primaryChannel': channel(theme.ink),
    'text-secondaryChannel': channel(theme.ink2),
    divider: theme.rule,
  };
  for (const [k, v] of Object.entries(mui)) vars[`--mui-palette-${k}`] = v;
  return vars;
}
