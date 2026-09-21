import type { ThemeColors } from './tokens';
import { curated, presetTheme } from './presets';
import { themeCssVars } from './palette';
import { PATHS } from '@/components/AtIcon';

/** The themes visitors can pick. Ember is the default (no stored choice). */
export const SITE_THEME_IDS = ['ember', 'ultraviolet', 'mint', 'aurora', 'coral'] as const;
export type SiteThemeId = (typeof SITE_THEME_IDS)[number];
export const THEME_STORAGE_KEY = 'at-theme';

export const siteThemes = SITE_THEME_IDS.map((id) => {
  const preset = curated.find((p) => p.id === id)!;
  return { id, name: preset.name, colors: presetTheme(preset) };
});

/** The favicon as an SVG data URL in a theme's colours. */
export function faviconFor(theme: ThemeColors) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 -13 426 426"><clipPath id="t"><rect x="12" y="-13" width="426" height="426" rx="96"/></clipPath><g clip-path="url(#t)"><rect x="12" y="-13" width="426" height="426" fill="${theme.accent}"/>` +
    PATHS.map(([d, key]) => `<path d="${d}" fill="${key ? theme[key] : '#ffffff'}"/>`).join('') +
    '</g></svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function applyTheme(theme: ThemeColors | null) {
  const root = document.documentElement;
  const vars = themeCssVars(theme ?? siteThemes[0].colors);
  for (const [name, value] of Object.entries(vars)) {
    if (theme) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-theme]');
  if (!theme) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.dataset.theme = '';
    document.head.appendChild(link);
  }
  link.href = faviconFor(theme);
}

/**
 * Inline script for <head>: applies a stored non-default theme before the
 * first paint so returning visitors don't see a flash of the default colours.
 */
export function themeBootScript() {
  const vars = Object.fromEntries(
    siteThemes.filter((t) => t.id !== 'ember').map((t) => [t.id, themeCssVars(t.colors)]),
  );
  return `(function(){try{var id=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var v=${JSON.stringify(vars)}[id];if(!v)return;var s=document.documentElement.style;for(var k in v)s.setProperty(k,v[k]);}catch(e){}})();`;
}
