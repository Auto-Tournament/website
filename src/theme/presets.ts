import { hex as ember, type ThemeColors } from './tokens';
import { deriveTheme } from './palette';

export type ThemePreset = {
  id: string;
  name: string;
  group?: string;
  /** The palette as given; shown as swatches and fed to deriveTheme. */
  colors: string[];
  /** Full colours when the theme isn't derived (the brand theme, the old app). */
  theme?: ThemeColors;
};

/** The purple Material 3 look the app had up to 2.4. */
const classicMat: ThemeColors = {
  paper: '#1c1b1f',
  paper2: '#2b2930',
  paper3: '#332d3c',
  ink: '#e6e1e5',
  ink2: '#cac4d0',
  muted: '#938f99',
  rule: '#49454f',
  accent: '#d0bcff',
  accent2: '#e8def8',
  accentInk: '#381e72',
  focus: '#d0bcff',
  live: '#a6e3d0',
  pick: '#a6e3d0',
  ban: '#ffb4ab',
  bloom: 'rgba(208, 188, 255, 0.16)',
  bloom2: 'rgba(156, 136, 214, 0.12)',
  logoInk: '#381e72',
  navGlass: 'rgba(43, 41, 48, 0.82)',
};

export const curated: ThemePreset[] = [
  { id: 'ember', name: 'Ember (current)', group: 'Current', colors: [ember.accent, ember.accent2, ember.paper3, ember.ink], theme: ember },

  // Picks from the existing palettes.
  { id: 'classic-mat', name: 'Classic MAT', group: 'Picks', colors: ['#d0bcff', '#e8def8', '#1c1b1f', '#e6e1e5'], theme: classicMat },
  { id: 'neon-violet', name: 'Neon violet', group: 'Picks', colors: ['#A855F7', '#D946EF', '#1E293B', '#F3E8FF'] },
  { id: 'color-drop', name: 'Color Drop', group: 'Picks', colors: ['#4B47E3', '#1B1C3A'] },
  { id: 'violet', name: 'Violet', group: 'Picks', colors: ['#7C3AED', '#A78BFA', '#1F2937', '#F3F4F6'] },
  { id: 'mint', name: 'Mint', group: 'Picks', colors: ['#2DCE89', '#20B2AA', '#1A6B5D', '#E0FBFC'] },

  // New palettes, tuned so the accent reads as text on the dark page.
  { id: 'ultraviolet', name: 'Ultraviolet', group: 'New', colors: ['#9D7BFF', '#C4B1FF', '#15112A', '#EFEAFF'] },
  { id: 'synthwave', name: 'Synthwave', group: 'New', colors: ['#FF4FD8', '#FF8BE6', '#140B24', '#FBE9FF'] },
  { id: 'plum-gold', name: 'Plum & gold', group: 'New', colors: ['#F2B84B', '#F7CF7E', '#1A1024', '#FFF4E0'] },
  { id: 'acid', name: 'Acid', group: 'New', colors: ['#C6FF3D', '#DBFF85', '#161A22', '#F4FFE0'] },
  { id: 'frost', name: 'Frost', group: 'New', colors: ['#5EC8FF', '#9ADCFF', '#0B1320', '#E6F6FF'] },

  // Other purples.
  { id: 'indigo', name: 'Indigo', group: 'More', colors: ['#4F46E5', '#4338CA', '#1F2937', '#E9D5FF'] },
  { id: 'amethyst', name: 'Amethyst', group: 'More', colors: ['#8B2BE2', '#A25CDB', '#2D2A4D', '#EDE7F6'] },
  { id: 'royal', name: 'Royal', group: 'More', colors: ['#5B21B6', '#A855F7', '#1F2937', '#F3F4F6'] },
  { id: 'periwinkle', name: 'Periwinkle', group: 'More', colors: ['#5C6BC0', '#8E99F3', '#1C1C2E', '#E1E1E1'] },
  { id: 'orchid', name: 'Orchid', group: 'More', colors: ['#8E24AA', '#AB47BC', '#1A1A1A', '#F3E5F5'] },
];

/** Every palette on produkto.io/color-palettes/esports (fetched 2026-09-21). */
const esports: string[][] = [
  ["#4B5563", "#6B7280", "#1F2937", "#F3F4F6"],
  ["#3B82F6", "#60A5FA", "#1F2937", "#F0F9FF"],
  ["#A855F7", "#D946EF", "#1E293B", "#F3E8FF"],
  ["#3B82F6", "#60A5FA", "#1E3A8A", "#EFF6FF"],
  ["#374151", "#6B7280", "#1F2937", "#F9FAFB"],
  ["#1E3A8A", "#3B82F6", "#1F2937", "#E0F2FE"],
  ["#4B5563", "#6B7280", "#1F2937", "#F9FAFB"],
  ["#4F46E5", "#A78BFA", "#1E293B", "#E5E7EB"],
  ["#1F2937", "#3B82F6", "#F9FAFB", "#F1F5F9"],
  ["#DC2626", "#FCA5A5", "#1F2937", "#FEF2F2"],
  ["#FBBF24", "#FDE68A", "#923E1D", "#FFFBEB"],
  ["#6B7280", "#9CA3AF", "#1F2937", "#F9FAFB"],
  ["#1E3A8A", "#3B82F6", "#111827", "#E0F2FE"],
  ["#3B82F6", "#60A5FA", "#1E293B", "#E0F2FE"],
  ["#7C3AED", "#A78BFA", "#1F2937", "#F3F4F6"],
  ["#2B6CB0", "#90CDF4", "#1A202C", "#EBF8FF"],
  ["#00BFFF", "#1E90FF", "#2C2C2C", "#E0F7FA"],
  ["#1F2937", "#4B5563", "#F3F4F6", "#F9FAFB"],
  ["#2D3748", "#4A5568", "#1A202C", "#F7FAFC"],
  ["#6B7280", "#9CA3AF", "#374151", "#F3F4F6"],
  ["#16A34A", "#22C55E", "#1F2937", "#F0FDF4"],
  ["#B91C1C", "#FCA5A1", "#1F2937", "#FEE2E2"],
  ["#F472B6", "#EC4899", "#1F2937", "#FDF2F8"],
  ["#5B21B6", "#A855F7", "#1F2937", "#F3F4F6"],
  ["#FF4F00", "#FF9A00", "#4A4A4A", "#FFE5D3"],
  ["#9333EA", "#A78BFA", "#1F2937", "#F3F4F6"],
  ["#2563EB", "#3B82F6", "#111827", "#E0F2FE"],
  ["#3B82F6", "#BFDBFE", "#1F2937", "#F9FAFB"],
  ["#60A5FA", "#93C5FD", "#1F2937", "#EFF6FF"],
  ["#F43F5E", "#F871A1", "#B91C1C", "#FEE2E2"],
  ["#2DCE89", "#20B2AA", "#1A6B5D", "#E0FBFC"],
  ["#F43F5E", "#FBBF24", "#1F2937", "#FEF9C3"],
  ["#0EA5E9", "#38BDF8", "#1F2937", "#F3F4F6"],
  ["#EF4444", "#FCA5A5", "#1F2937", "#F3F4F6"],
  ["#22C55E", "#86EFAC", "#1F2937", "#F3F4F6"],
  ["#B91C1C", "#D53F3F", "#3A0E0E", "#FEE2E2"],
  ["#C2410C", "#F59E0B", "#1F2937", "#FFEDD5"],
  ["#7B3F00", "#A95C0D", "#1F1F1F", "#F3E5D7"],
  ["#D83B3B", "#F57C20", "#2B2D42", "#F8F8F8"],
  ["#4B0082", "#6A1B9A", "#212121", "#E5E5E5"],
  ["#5C6BC0", "#8E99F3", "#1C1C2E", "#E1E1E1"],
  ["#8E24AA", "#AB47BC", "#1A1A1A", "#F3E5F5"],
  ["#00BCD4", "#26C6DA", "#263238", "#E1F5FE"],
  ["#B91C1C", "#FCA5A1", "#1F2937", "#FCE7F3"],
  ["#4B0082", "#6A5ACD", "#2E2E2E", "#E8EAF6"],
  ["#8B2BE2", "#A25CDB", "#2D2A4D", "#EDE7F6"],
  ["#4F46E5", "#4338CA", "#1F2937", "#E9D5FF"],
  ["#0F172A", "#1E293B", "#111827", "#F9FAFB"],
  ["#FBBF24", "#F59E0B", "#B45309", "#FEF9C3"],
];

export const esportsPresets: ThemePreset[] = esports.map((colors, i) => ({
  id: `esports-${i + 1}`,
  name: `Esports ${i + 1}`,
  group: 'Esports palettes (produkto.io)',
  colors,
}));

export function presetTheme(preset: ThemePreset, accent?: number): ThemeColors {
  return preset.theme && accent === undefined ? preset.theme : deriveTheme(preset.colors, { accent });
}
