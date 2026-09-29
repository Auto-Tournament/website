'use client';

/*
 * The console's own navbar: only console things, and a clear way back to the
 * main site. Same visual language as the site's SiteNav (src/components/nav/SiteNav.tsx) —
 * the sticky floating pill, navGlass fill, no backdrop blur — and now the same
 * dropdown-menu primitive (src/components/nav/NavMenu.tsx): hover/click to
 * open, Escape to close and return focus, arrow keys inside the panel. The
 * customer area shows plain links plus a "Buy" button and (with more than one
 * organization) the organization switcher as a menu; the admin area groups
 * its nine destinations into Overview plus four menus (Sales, Customers,
 * Inbox, Security) instead of nine links in a row. Below 900px every section
 * collapses into one "Menu" button that opens a full-width sheet, the same
 * shape as SiteNav's phone sheet. Replaces SiteNav + Footer + ConsoleSubNav on
 * every console page (src/app/console/layout.tsx).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { List } from '@phosphor-icons/react/dist/csr/List';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { AtIcon } from '../AtIcon';
import { AccountMenu, type NavAccount } from '../nav/AccountMenu';
import { NavMenu, NavMenuItem } from '../nav/NavMenu';
import { OrgSwitcherMenu } from './forms';
import type { ActionState } from '@/app/console/actions';
import type { Role } from '@/lib/db/schema';
import { activeSection, navArea, navEntriesFor, navGroups, type ConsoleArea, type ConsoleNavEntry } from './consoleNav';

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

const menuButtonSx = {
  placeItems: 'center',
  width: 36,
  height: 36,
  p: 0,
  border: `1px solid ${color.rule}`,
  borderRadius: `${radius.pill}px`,
  bgcolor: 'transparent',
  color: color.ink,
  cursor: 'pointer',
  '&:hover': { bgcolor: color.paper3 },
  '&:active': { bgcolor: color.rule },
} as const;

export type ConsoleOrgSwitch = {
  orgs: { id: string; name: string }[];
  current: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
};

/** One navbar entry: a plain link, the primary Buy button, or a menu. */
function NavEntry({ entry, active, hydrated }: { entry: ConsoleNavEntry; active: string | null; hydrated: boolean }) {
  if (entry.kind === 'link') {
    return (
      <Box component="a" href={entry.href} aria-current={entry.href === active ? 'page' : undefined} sx={linkSx(entry.href === active)}>
        {entry.label}
      </Box>
    );
  }
  if (entry.kind === 'button') {
    return (
      <Button variant="contained" size="small" href={entry.href} aria-current={entry.href === active ? 'page' : undefined} sx={{ whiteSpace: 'nowrap' }}>
        {entry.label}
      </Button>
    );
  }
  const many = entry.items.length > 1;
  return (
    <NavMenu id={`console-${entry.id}`} hydrated={hydrated} fallbackHref={entry.items[0]?.href ?? '/'} panelLabel={entry.label} width={many ? '17rem' : '14rem'} trigger={<>{entry.label}<CaretDown className="nav-menu-caret" size={12} weight="bold" aria-hidden /></>}>
      {entry.items.map((item) => (
        <NavMenuItem key={item.href} href={item.href} label={item.label} note={item.note} active={item.href === active} />
      ))}
    </NavMenu>
  );
}

export function ConsoleNavBar({ base, account, org, role }: { base: string; account?: NavAccount; org?: ConsoleOrgSwitch; /** The role in the current organization; null with none. Undefined shows every section. */ role?: Role | null }) {
  const hydrated = useHydrated();
  const pathname = usePathname() ?? '';
  const area: ConsoleArea | null = navArea(pathname);
  const active = area ? activeSection(area, pathname) : null;
  const entries = area ? navEntriesFor(area, base, role) : [];
  const groups = area ? navGroups(area, base, role) : [];

  const [accountOpen, setAccountOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // The phone sheet: lock the page behind it, keep focus inside the header,
  // close on Escape and when the window widens to the desktop layout.
  useEffect(() => {
    if (!sheet) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSheet(false);
        menuButtonRef.current?.focus();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) menuButtonRef.current?.focus();
    };
    const wide = window.matchMedia('(min-width: 900px)');
    const onWide = () => wide.matches && setSheet(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    wide.addEventListener('change', onWide);
    return () => {
      html.style.overflow = before;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      wide.removeEventListener('change', onWide);
    };
  }, [sheet]);

  const showSwitcher = Boolean(org && org.orgs.length > 1);

  return (
    <Box ref={headerRef} component="header" sx={{ position: 'sticky', top: 16, zIndex: 10, display: 'flex', justifyContent: 'center', px: 2 }}>
      <Box
        sx={{
          position: 'relative',
          zIndex: 2,
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

        {entries.length > 0 && (
          <Box component="nav" aria-label="Console" sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0 }}>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'nowrap' }}>
              {entries.map((entry) => (
                <li key={entry.kind === 'menu' ? entry.id : entry.href}>
                  <NavEntry entry={entry} active={active} hydrated={hydrated} />
                </li>
              ))}
            </Box>
          </Box>
        )}

        {entries.length > 0 && hydrated ? (
          <Box
            component="button"
            type="button"
            ref={menuButtonRef}
            aria-expanded={sheet}
            aria-controls="console-menu-sheet"
            aria-label={sheet ? 'Close menu' : 'Menu'}
            onClick={() => {
              setAccountOpen(false);
              setSheet((s) => !s);
            }}
            sx={{ ...menuButtonSx, display: { xs: 'grid', md: 'none' } }}
          >
            {sheet ? <X size={18} weight="bold" aria-hidden /> : <List size={18} weight="bold" aria-hidden />}
          </Box>
        ) : (
          entries.length > 0 && (
            <Box component="a" href={entries[0].kind === 'menu' ? entries[0].items[0]?.href : entries[0].href} aria-label="Menu" sx={{ ...menuButtonSx, display: { xs: 'grid', md: 'none' } }}>
              <List size={18} weight="bold" aria-hidden />
            </Box>
          )
        )}

        {showSwitcher && org && <OrgSwitcherMenu action={org.action} orgs={org.orgs} current={org.current} hydrated={hydrated} />}

        <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', pl: 1 }}>
          {account && <AccountMenu account={account} hydrated={hydrated} open={accountOpen} onOpenChange={setAccountOpen} />}
        </Box>
      </Box>

      {/* Phones and tablets: the full-width sheet, the same shape as SiteNav's. */}
      {hydrated && entries.length > 0 && (
        <Box
          id="console-menu-sheet"
          data-testid="console-sheet"
          data-open={sheet || undefined}
          inert={!sheet}
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 1,
            display: { xs: 'block', md: 'none' },
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            bgcolor: color.paper,
            pt: '84px',
            pb: 4,
            px: 2,
            opacity: sheet ? 1 : 0,
            visibility: sheet ? 'visible' : 'hidden',
            transform: sheet ? 'none' : 'translateY(-8px)',
            transition: `opacity ${duration.fast}ms ${ease.out}, transform ${duration.base}ms ${ease.out}, visibility 0s linear ${sheet ? 0 : duration.fast}ms`,
            ...noMotion,
          }}
        >
          <Box component="nav" aria-label="Menu" sx={{ maxWidth: '36rem', mx: 'auto', display: 'grid', gap: 3 }}>
            {groups.map((g, i) => (
              <Box component="section" key={g.heading ?? `plain-${i}`} aria-labelledby={g.heading ? `sheet-${g.heading}` : undefined}>
                {g.heading && (
                  <Box component="h2" id={`sheet-${g.heading}`} sx={{ m: 0, mb: 0.5, px: 1.25, color: color.muted, fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'inherit' }}>
                    {g.heading}
                  </Box>
                )}
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}>
                  {g.items.map((item) => (
                    <li key={item.href}>
                      <Box
                        component="a"
                        href={item.href}
                        aria-current={item.href === active ? 'page' : undefined}
                        onClick={() => setSheet(false)}
                        sx={{
                          display: 'block',
                          px: 1.25,
                          py: 1,
                          borderRadius: `${radius.md}px`,
                          color: `${color.ink} !important`,
                          bgcolor: item.href === active ? color.paper3 : 'transparent',
                          fontWeight: item.href === active ? 600 : 400,
                          fontSize: '0.9375rem',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                          '&:hover, &:focus-visible': { bgcolor: color.paper3 },
                        }}
                      >
                        {item.label}
                      </Box>
                    </li>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
