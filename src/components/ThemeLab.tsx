'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { tokens, type ThemeColors } from '@/theme/tokens';
import { parseColors, themeCssVars, deriveTheme } from '@/theme/palette';
import { curated, esportsPresets, presetTheme, type ThemePreset } from '@/theme/presets';
import { fontMono } from '@/theme/theme';
import { PATHS } from './AtIcon';

/**
 * Theme lab: try palettes on the page. Development only; visitors get the
 * four-theme ThemePicker in the footer. Paste any colours (a palette
 * site's hex codes), pick a preset, or click a swatch to make it the accent.
 */

const { color, radius } = tokens;
const STORAGE_KEY = 'at-theme-lab';

type Saved = { id?: string; colors: string[]; accent?: number };

function applyTheme(theme: ThemeColors) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeCssVars(theme))) root.style.setProperty(name, value);
  // Recolour the favicon too.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 -13 426 426"><clipPath id="t"><rect x="12" y="-13" width="426" height="426" rx="96"/></clipPath><g clip-path="url(#t)"><rect x="12" y="-13" width="426" height="426" fill="${theme.accent}"/>` +
    PATHS.map(([d, key]) => `<path d="${d}" fill="${key ? theme[key] : '#ffffff'}"/>`).join('') +
    '</g></svg>';
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-theme-lab]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.dataset.themeLab = '';
    document.head.appendChild(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function clearTheme() {
  const root = document.documentElement;
  for (const name of Object.keys(themeCssVars(presetTheme(curated[0])))) root.style.removeProperty(name);
  document.querySelector('link[rel="icon"][data-theme-lab]')?.remove();
}

const allPresets = [...curated, ...esportsPresets];
const groups = Object.entries(
  allPresets.reduce<Record<string, ThemePreset[]>>((acc, p) => {
    (acc[p.group ?? 'Other'] ??= []).push(p);
    return acc;
  }, {}),
);

function Swatches({ colors, active, onPick, height = 22 }: { colors: string[]; active?: number; onPick?: (i: number) => void; height?: number }) {
  return (
    <Box sx={{ display: 'flex', borderRadius: `${radius.sm}px`, overflow: 'hidden', border: `1px solid ${color.rule}`, flex: 1 }}>
      {colors.map((c, i) => (
        <Box
          key={`${c}-${i}`}
          component={onPick ? 'button' : 'span'}
          title={onPick ? `${c}: use as accent` : c}
          onClick={onPick ? () => onPick(i) : undefined}
          sx={{
            flex: 1,
            height,
            bgcolor: c,
            border: 0,
            p: 0,
            cursor: onPick ? 'pointer' : 'inherit',
            outline: active === i ? `2px solid ${color.ink}` : 'none',
            outlineOffset: -3,
          }}
        />
      ))}
    </Box>
  );
}

export function ThemeLab() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [paste, setPaste] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const on = process.env.NODE_ENV === 'development';
    setEnabled(on);
    if (!on) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved(JSON.parse(raw) as Saved);
    } catch {
      // No storage: start from the default theme.
    }
  }, []);

  const theme = useMemo(() => {
    if (!saved) return null;
    const preset = saved.id ? allPresets.find((p) => p.id === saved.id) : undefined;
    return preset ? presetTheme(preset, saved.accent) : deriveTheme(saved.colors, { accent: saved.accent });
  }, [saved]);

  // Only undo what the lab applied itself, so the footer ThemePicker's choice
  // survives until the lab is actually used.
  const applied = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (theme) {
      applyTheme(theme);
      applied.current = true;
    } else if (applied.current) {
      clearTheme();
      applied.current = false;
    }
  }, [enabled, theme]);

  const choose = useCallback((next: Saved | null) => {
    setSaved(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Not persisted; the choice still applies until reload.
    }
  }, []);

  if (!enabled) return null;

  const pickPreset = (p: ThemePreset) => choose(p.id === 'ember' ? null : { id: p.id, colors: p.colors });
  const pasted = parseColors(paste);
  const current = saved ?? { id: 'ember', colors: curated[0].colors };
  const currentName = allPresets.find((p) => p.id === current.id)?.name ?? 'Pasted palette';

  const copy = async () => {
    const out = JSON.stringify({ palette: current.colors, accent: current.accent, theme: theme ?? presetTheme(curated[0]) }, null, 2);
    try {
      await navigator.clipboard.writeText(out);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy the theme:', out);
    }
  };

  const row = (p: ThemePreset) => (
    <Box
      key={p.id}
      component="button"
      onClick={() => pickPreset(p)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        width: '100%',
        p: 1,
        border: `1px solid ${current.id === p.id ? color.accent : 'transparent'}`,
        borderRadius: `${radius.sm}px`,
        bgcolor: 'transparent',
        color: color.ink2,
        font: 'inherit',
        fontSize: '0.8125rem',
        textAlign: 'left',
        cursor: 'pointer',
        '&:hover': { bgcolor: color.paper3 },
      }}
    >
      <Box component="span" sx={{ width: 118, flexShrink: 0 }}>
        {p.name}
      </Box>
      <Swatches colors={p.colors} height={16} />
    </Box>
  );

  return (
    <>
      <Button
        onClick={() => setOpen((o) => !o)}
        variant="contained"
        size="small"
        sx={{ position: 'fixed', left: 16, bottom: 16, zIndex: 1400 }}
      >
        Themes
      </Button>
      {open && (
        <Box
          role="dialog"
          aria-label="Theme lab"
          sx={{
            position: 'fixed',
            left: 16,
            bottom: 64,
            zIndex: 1400,
            width: 'min(380px, calc(100vw - 32px))',
            maxHeight: 'min(78vh, 760px)',
            overflowY: 'auto',
            p: 2,
            bgcolor: color.paper2,
            border: `1px solid ${color.rule}`,
            borderRadius: `${radius.md}px`,
            boxShadow: '0 30px 80px -30px rgba(0,0,0,0.7)',
            display: 'grid',
            gap: 2,
          }}
        >
          <div>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>{currentName}</Typography>
            <Swatches colors={current.colors} active={current.accent} onPick={(i) => choose({ ...current, accent: i })} height={30} />
            <Typography sx={{ color: color.muted, fontSize: '0.75rem', mt: 0.75 }}>
              Click a swatch to make it the accent.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
              <Button size="small" variant="outlined" onClick={copy}>
                {copied ? 'Copied' : 'Copy theme'}
              </Button>
              <Button size="small" variant="outlined" onClick={() => choose(null)}>
                Reset
              </Button>
            </Box>
          </div>

          <div>
            <TextField
              label="Paste colours"
              placeholder="#4F46E5 #4338CA #1F2937 #E9D5FF"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={1}
              slotProps={{ htmlInput: { style: { fontFamily: fontMono, fontSize: '0.8125rem' } } }}
            />
            {pasted.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                <Swatches colors={pasted} />
                <Button size="small" variant="contained" onClick={() => choose({ colors: pasted })}>
                  Try it
                </Button>
              </Box>
            )}
          </div>

          {groups.map(([group, presets]) => (
            <div key={group}>
              <Typography sx={{ color: color.muted, fontSize: '0.75rem', mb: 0.5, fontFamily: fontMono, textTransform: 'uppercase' }}>
                {group}
              </Typography>
              {presets.map(row)}
            </div>
          ))}
        </Box>
      )}
    </>
  );
}
