import { hex as ember, type ThemeColors } from './tokens';
import { deriveTheme } from './palette';

export type ThemePreset = {
  id: string;
  name: string;
  group?: string;
  /** The palette as given; shown as swatches and fed to deriveTheme. */
  colors: string[];
  /** Full colours when the theme isn't derived (the brand theme). */
  theme?: ThemeColors;
};

/** The five themes: Ember is the default. */
export const curated: ThemePreset[] = [
  { id: 'ember', name: 'Ember', group: 'Shortlist', colors: [ember.accent, ember.accent2, ember.paper3, ember.ink], theme: ember },
  { id: 'ultraviolet', name: 'Ultraviolet', group: 'Shortlist', colors: ['#9D7BFF', '#C4B1FF', '#15112A', '#EFEAFF'] },
  { id: 'mint', name: 'Mint', group: 'Shortlist', colors: ['#2DCE89', '#20B2AA', '#1A6B5D', '#E0FBFC'] },
  // Mint on a violet night.
  { id: 'aurora', name: 'Aurora', group: 'Shortlist', colors: ['#5EEAB5', '#9AF5D2', '#120F24', '#EAFFF6'] },
  // A pink-leaning coral: warm like Ember, brighter and less brown.
  { id: 'coral', name: 'Coral', group: 'Shortlist', colors: ['#FF5F7E', '#FF8FA3', '#1A0F16', '#FFEAF0'] },
];

export function presetTheme(preset: ThemePreset, accent?: number): ThemeColors {
  return preset.theme && accent === undefined ? preset.theme : deriveTheme(preset.colors, { accent });
}
