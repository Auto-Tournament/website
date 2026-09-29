'use client';

/*
 * The console's own navbar: only console things, and a clear way back to the
 * main site. Same visual language as the site's SiteNav (src/components/nav/SiteNav.tsx) —
 * the sticky floating pill, navGlass fill, no backdrop blur — but console-only
 * content: a back link to autotournament.gg, the console logo, the current
 * area's sections (with aria-current, collapsing into a "Menu" sheet below
 * 900px), the organization switcher (more than one organization), and the
 * account menu. Replaces SiteNav + Footer + ConsoleSubNav on every console
 * page (src/app/console/layout.tsx).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { AtIcon } from '../AtIcon';
import { AccountMenu, type NavAccount } from '../nav/AccountMenu';
import { OrgSwitcher } from './forms';
import type { ActionState } from '@/app/console/actions';
import { activeSection, navArea, sectionLinks, sections } from './consoleNav';

const { color, radius, ease, duration } = tokens;

const noMotion = { '@media (prefers-reduced-motion: reduce)': { transition: 'none' } } as const;

/** false while the server renders and during hydration, true after. */
const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

const linkSx = (on: boolean) =>
  ({
    display: 'inline-flex',
    alignItems: 'center',
    px: 1.25,
    py: 0.75,
    borderRadius: `${radius.pill}px`,
    bgcolor: on ? color.paper3 : 'transparent',
    color: on ? `${color.ink} !important` : `${color.ink2} !important`,
    fontSize: '0.875rem',
    fontWeight: on ? 600 : 400,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: `background-color ${duration.fast}ms ${ease.out}, color ${duration.fast}ms ${ease.out}`,
    ...noMotion,
    '&:hover': { color: `${color.ink} !important`, bgcolor: on ? color.paper3 : color.rule },
  }) as const;

export type ConsoleOrgSwitch = {
  orgs: { id: string; name: string }[];
  current: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
};

export function ConsoleNavBar({ base, account, org }: { base: string; account?: NavAccount; org?: ConsoleOrgSwitch }) {
  const hydrated = useHydrated();
  const pathname = usePathname() ?? '';
  const area = navArea(pathname);
  const active = area ? activeSection(area, pathname) : null;
  const items = area ? sectionLinks(area, base).map((l, i) => ({ ...l, path: sections[area][i].href })) : [];

  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // The narrow "Menu" sheet closes on a click elsewhere and on Escape.
  useEffect(() => {
    if (!menuOpen) return;
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
  }, [menuOpen]);

  const showSwitcher = Boolean(org && org.orgs.length > 1);

  return (
    <Box component="header" sx={{ position: 'sticky', top: 16, zIndex: 10, display: 'flex', justifyContent: 'center', px: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 1.5 },
          maxWidth: '100%',
          minWidth: 0,
          py: 1,
          pr: 1,
          pl: 1.5,
          bgcolor: color.navGlass,
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.pill}px`,
        }}
      >
        <Box
          component="a"
          href="https://autotournament.gg"
          aria-label="Back to autotournament.gg"
          data-testid="console-back-link"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.75, borderRadius: `${radius.pill}px`, color: `${color.ink2} !important`, textDecoration: 'none', fontSize: '0.875rem', whiteSpace: 'nowrap', '&:hover': { color: `${color.ink} !important`, bgcolor: color.rule } }}
        >
          <ArrowLeft size={14} weight="bold" aria-hidden />
          <Box component="span" sx={{ '@media (max-width: 599.95px)': { display: 'none' } }}>
            autotournament.gg
          </Box>
        </Box>

        <Box
          component="a"
          href={base || '/'}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit', fontFamily: fontDisplay, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          <AtIcon size={22} radius="6px" />
          Console
        </Box>

        {items.length > 0 && (
          <Box component="nav" aria-label="Console" sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0 }}>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'nowrap' }}>
              {items.map((item) => {
                const on = item.path === active;
                return (
                  <li key={item.path}>
                    <Box component="a" href={item.href} aria-current={on ? 'page' : undefined} sx={linkSx(on)}>
                      {item.label}
                    </Box>
                  </li>
                );
              })}
            </Box>
          </Box>
        )}

        {items.length > 0 && (
          <Box
            component="details"
            ref={detailsRef}
            onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => setMenuOpen(e.currentTarget.open)}
            sx={{ display: { xs: 'block', md: 'none' }, position: 'relative' }}
          >
            <Box
              component="summary"
              data-testid="console-menu-button"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.75,
                border: `1px solid ${color.rule}`,
                borderRadius: `${radius.pill}px`,
                color: color.ink,
                fontSize: '0.875rem',
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
              Menu
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
                width: 'min(16rem, calc(100vw - 32px))',
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
                      }}
                    >
                      {item.label}
                    </Box>
                  </li>
                );
              })}
            </Box>
          </Box>
        )}

        {showSwitcher && org && (
          <Box sx={{ minWidth: 0, maxWidth: { xs: '8rem', sm: '12rem' } }}>
            <OrgSwitcher action={org.action} orgs={org.orgs} current={org.current} />
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', pl: 1 }}>
          {account && <AccountMenu account={account} hydrated={hydrated} open={accountOpen} onOpenChange={setAccountOpen} />}
        </Box>
      </Box>
    </Box>
  );
}
