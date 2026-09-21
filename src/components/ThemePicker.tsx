'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { applyTheme, siteThemes, THEME_STORAGE_KEY, type SiteThemeId } from '@/theme/siteThemes';

const { color } = tokens;

/** Four colour dots; the choice is remembered in this browser. */
export function ThemePicker() {
  const [active, setActive] = useState<SiteThemeId>('ember');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as SiteThemeId | null;
      const found = siteThemes.find((t) => t.id === stored);
      if (found) {
        setActive(found.id);
        applyTheme(found.colors); // favicon; the colours are already set by the boot script
      }
    } catch {
      // No storage: stay on the default.
    }
  }, []);

  const choose = (id: SiteThemeId) => {
    setActive(id);
    const theme = siteThemes.find((t) => t.id === id)!;
    applyTheme(id === 'ember' ? null : theme.colors);
    try {
      if (id === 'ember') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // Not remembered; still applies for this visit.
    }
  };

  return (
    <Box role="radiogroup" aria-label="Colour theme" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {siteThemes.map((t) => (
        <Box
          key={t.id}
          component="button"
          type="button"
          role="radio"
          aria-checked={active === t.id}
          aria-label={t.name}
          title={t.name}
          onClick={() => choose(t.id)}
          sx={{
            width: 22,
            height: 22,
            p: 0,
            borderRadius: '50%',
            cursor: 'pointer',
            bgcolor: t.colors.accent,
            border: `3px solid ${t.colors.paper3}`,
            outline: active === t.id ? `2px solid ${color.ink}` : 'none',
            outlineOffset: 1,
          }}
        />
      ))}
    </Box>
  );
}
