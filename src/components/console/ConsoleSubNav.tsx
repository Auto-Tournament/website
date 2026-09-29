'use client';

/* The console's second row under the site nav: the sections of the area you
 * are in (your organization's, or the admin CRM's), the current one marked
 * with aria-current. On narrow screens the row collapses into one disclosure
 * menu instead of scrolling sideways. `aside` sits at the row's end (the
 * organization switcher). */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { tokens } from '@/theme/tokens';
import { activeSection, sectionLinks, sections, type ConsoleArea } from './consoleNav';

const { color, radius, ease, duration } = tokens;

const noMotion = { '@media (prefers-reduced-motion: reduce)': { transition: 'none' } } as const;

/** Where the row gives way to the menu: the admin area has more sections. */
const wideFrom: Record<ConsoleArea, 'sm' | 'md'> = { org: 'sm', admin: 'md' };

export function ConsoleSubNav({ area, base, title, aside }: { area: ConsoleArea; base: string; title?: string; aside?: ReactNode }) {
  const pathname = usePathname() ?? '';
  const active = activeSection(area, pathname);
  const items = sectionLinks(area, base).map((l, i) => ({ ...l, path: sections[area][i].href }));
  const current = items.find((i) => i.path === active);
  const bp = wideFrom[area];

  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  // The collapsed menu closes on a click elsewhere and on Escape (back to its button).
  useEffect(() => {
    if (!open) return;
    const details = detailsRef.current;
    const onPointerDown = (e: PointerEvent) => {
      if (details && !details.contains(e.target as Node)) details.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && details) {
        details.open = false;
        details.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <Box
      data-testid="console-subnav"
      data-area={area}
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 3, rowGap: 1.5, mb: 5, pb: { xs: 1.5, [bp]: 0 }, borderBottom: `1px solid ${color.rule}` }}
    >
      {title && (
        <Box sx={{ display: { xs: 'none', [bp]: 'block' }, color: color.accent, fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{title}</Box>
      )}
      <Box component="nav" aria-label="Console" sx={{ minWidth: 0, position: 'relative' }}>
        {/* Wide: the row. */}
        <Box component="ul" sx={{ display: { xs: 'none', [bp]: 'flex' }, listStyle: 'none', m: 0, p: 0, gap: 0.5 }}>
          {items.map((item) => {
            const on = item.path === active;
            return (
              <li key={item.path}>
                <Box
                  component="a"
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  sx={{
                    display: 'block',
                    px: 1,
                    py: 1.5,
                    // Sits on the row's rule: the current section's underline replaces it.
                    mb: '-1px',
                    borderBottom: `2px solid ${on ? color.accent : 'transparent'}`,
                    color: on ? `${color.ink} !important` : `${color.ink2} !important`,
                    fontSize: '0.875rem',
                    fontWeight: on ? 600 : 400,
                    lineHeight: 1.3,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    transition: `color ${duration.fast}ms ${ease.out}, border-color ${duration.fast}ms ${ease.out}`,
                    ...noMotion,
                    '&:hover': { color: `${color.ink} !important`, borderBottomColor: on ? color.accent : color.rule },
                  }}
                >
                  {item.label}
                </Box>
              </li>
            );
          })}
        </Box>

        {/* Narrow: one menu with the current section on its button. */}
        <Box
          component="details"
          ref={detailsRef}
          onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => setOpen(e.currentTarget.open)}
          sx={{ display: { xs: 'block', [bp]: 'none' } }}
        >
          <Box
            component="summary"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              border: `1px solid ${color.rule}`,
              borderRadius: `${radius.pill}px`,
              color: color.ink,
              fontSize: '0.9375rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              listStyle: 'none',
              '&::-webkit-details-marker': { display: 'none' },
              '&:hover': { bgcolor: color.paper3 },
              '& .caret': { transition: `transform ${duration.base}ms ${ease.out}`, ...noMotion },
              'details[open] > & .caret': { transform: 'rotate(180deg)' },
            }}
          >
            {title && (
              <Box component="span" sx={{ color: color.accent, fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {title}
              </Box>
            )}
            <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
              Section:
            </Box>
            {current?.label ?? 'Sections'}
            <CaretDown className="caret" size={12} weight="bold" aria-hidden />
          </Box>
          <Box
            component="ul"
            sx={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              zIndex: 5,
              boxSizing: 'border-box',
              width: 'min(18rem, calc(100vw - 32px))',
              listStyle: 'none',
              m: 0,
              p: 1,
              display: 'grid',
              gap: 0.25,
              bgcolor: color.paper2,
              border: `1px solid ${color.rule}`,
              borderRadius: `${radius.lg}px`,
              boxShadow: '0 24px 48px -24px rgba(0, 0, 0, 0.6)',
            }}
          >
            {items.map((item) => {
              const on = item.path === active;
              return (
                <li key={item.path}>
                  <Box
                    component="a"
                    href={item.href}
                    aria-current={on ? 'page' : undefined}
                    sx={{
                      display: 'block',
                      px: 1.25,
                      py: 1,
                      borderRadius: `${radius.md}px`,
                      color: `${color.ink} !important`,
                      bgcolor: on ? color.paper3 : 'transparent',
                      fontWeight: on ? 600 : 400,
                      fontSize: '0.9375rem',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      '&:hover, &:focus-visible': { bgcolor: color.paper3 },
                      '&:focus-visible': { outlineOffset: 0 },
                    }}
                  >
                    {item.label}
                  </Box>
                </li>
              );
            })}
          </Box>
        </Box>
      </Box>
      {aside && <Box sx={{ ml: 'auto', minWidth: 0, maxWidth: '100%', py: { [bp]: 1 } }}>{aside}</Box>}
    </Box>
  );
}
