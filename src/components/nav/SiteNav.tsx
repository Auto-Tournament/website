'use client';

/* Hallmark · component: nav (N5 floating pill + N11 shared mega-menu panel) · genre: modern-minimal · theme: Auto Tournament system
 * states: default · hover · focus · active (open) · disabled (n/a: every item is a link) · loading (status dot grey) · error (status dot grey) · success (status dot tone)
 * contrast: ink2 on navGlass, ink on paper3; focus ring from the theme (2px focus colour)
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { BookOpen } from '@phosphor-icons/react/dist/csr/BookOpen';
import { ChatCircle } from '@phosphor-icons/react/dist/csr/ChatCircle';
import { DiscordLogo } from '@phosphor-icons/react/dist/csr/DiscordLogo';
import { GameController } from '@phosphor-icons/react/dist/csr/GameController';
import { GithubLogo } from '@phosphor-icons/react/dist/csr/GithubLogo';
import { List } from '@phosphor-icons/react/dist/csr/List';
import { SealCheck } from '@phosphor-icons/react/dist/csr/SealCheck';
import { Tag } from '@phosphor-icons/react/dist/csr/Tag';
import { Trophy } from '@phosphor-icons/react/dist/csr/Trophy';
import { UserCircle } from '@phosphor-icons/react/dist/csr/UserCircle';
import { X } from '@phosphor-icons/react/dist/csr/X';
import type { CompatStatus } from '@/lib/compat/document';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { AtIcon } from '../AtIcon';
import { CompatDot, compatSummaryTone } from '../compat/CompatDot';
import { CompatNavStatus, useCompatStatus } from '../compat/CompatNavStatus';
import { overallLabel } from '../compat/labels';
import { links } from '../links';
import { AccountMenu, type NavAccount } from './AccountMenu';
import { barLinks, isExternal, menusFor, nextIndex, panelLeft, siteHref, type NavIcon, type NavLink, type NavMenu } from './navItems';

const { color, radius, ease, duration } = tokens;

type MenuId = NavMenu['id'];

/** Wait this long on a trigger before its panel opens, so passing over it doesn't. */
const OPEN_DELAY = 80;
/** Wait this long after the pointer leaves before closing, so it can travel into the panel. */
const CLOSE_DELAY = 150;
/** A click this soon after hover opened the panel keeps it open instead of toggling it shut. */
const HOVER_CLICK_GRACE = 400;
/** Space between the pill and the panel. */
const PANEL_GAP = 8;

const icons: Record<NavIcon, typeof Trophy> = {
  features: Trophy,
  games: GameController,
  docs: BookOpen,
  github: GithubLogo,
  discord: DiscordLogo,
  console: UserCircle,
  pricing: Tag,
  verify: SealCheck,
  contact: ChatCircle,
};

const reduced = '@media (prefers-reduced-motion: reduce)';
const noMotion = { [reduced]: { transition: 'none' } } as const;

const visuallyHidden = {
  position: 'absolute',
  // Strings: in sx a bare 1 means 100%.
  width: '1px',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** false while the server renders and during hydration, true after: the menus only become buttons once their script runs. */
const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** True while the visitor is scrolling down past the top of the page. */
function useScrollingDown(threshold = 80) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        // Ignore tiny moves (trackpad jitter) so the nav doesn't flicker.
        if (Math.abs(y - last) < 6) return;
        setDown(y > last && y > threshold);
        last = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return down;
}

function externalProps(href: string, site = '') {
  return isExternal(href, site) ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

function ExternalMark({ href, site = '', size = 12 }: { href: string; site?: string; size?: number }) {
  if (!isExternal(href, site)) return null;
  return (
    <>
      <ArrowUpRight size={size} weight="bold" aria-hidden style={{ flex: 'none', opacity: 0.7 }} />
      <Box component="span" sx={visuallyHidden}>
        (opens in a new tab)
      </Box>
    </>
  );
}

/** One destination in a panel or the phone sheet: icon, label, one line of what it is. */
function MenuItem({ item, status, site, onNavigate, width }: { item: NavLink; status: CompatStatus; site: string; onNavigate?: () => void; width?: string }) {
  const Icon = icons[item.icon];
  const tone = compatSummaryTone(status.overall);
  return (
    <Box
      component="a"
      href={item.href}
      {...externalProps(item.href, site)}
      onClick={onNavigate}
      data-nav-item=""
      sx={{
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr)',
        gap: 1.5,
        alignItems: 'start',
        width,
        p: 1.25,
        borderRadius: `${radius.md}px`,
        color: color.ink,
        textDecoration: 'none',
        transition: `background-color ${duration.fast}ms ${ease.out}`,
        ...noMotion,
        '& .nav-icon': { color: color.ink2, transition: `color ${duration.fast}ms ${ease.out}`, ...noMotion },
        '&:hover, &:focus-visible': { bgcolor: color.paper3 },
        '&:hover .nav-icon, &:focus-visible .nav-icon': { color: color.accent },
        '&:active': { bgcolor: color.rule },
        '&:focus-visible': { outlineOffset: 0 },
      }}
    >
      <Box
        className="nav-icon"
        aria-hidden
        sx={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: `${radius.sm}px`, bgcolor: color.paper3, border: `1px solid ${color.rule}` }}
      >
        <Icon size={18} />
      </Box>
      <Box component="span" sx={{ display: 'grid', gap: 0.25, minWidth: 0, pt: 0.125 }}>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3 }}>
          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
            {item.label}
          </Box>
          <ExternalMark href={item.href} site={site} />
        </Box>
        <Box component="span" sx={{ color: color.muted, fontSize: '0.8125rem', lineHeight: 1.45 }}>
          {item.note}
        </Box>
        {item.status && (
          <Box
            component="span"
            data-testid="nav-menu-compat"
            data-tone={tone}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 0.25, color: color.ink2, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
          >
            <CompatDot tone={tone} size={7} />
            {status.overall ? overallLabel[status.overall] : 'Status unknown'}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** The contents of one menu in the desktop panel. */
function PanelSection({ menu, status, site }: { menu: NavMenu; status: CompatStatus; site: string }) {
  const many = menu.groups.length > 1;
  return (
    <Box sx={{ display: 'grid', gridAutoFlow: 'column', gap: 2, p: 1.5 }}>
      {menu.groups.map((group) => (
        <Box key={group.heading} sx={{ display: 'grid', alignContent: 'start', gap: 0.5 }}>
          {many && (
            <Box component="p" aria-hidden sx={{ m: 0, px: 1.25, pt: 0.5, pb: 0.25, color: color.muted, fontSize: '0.75rem', fontWeight: 500 }}>
              {group.heading}
            </Box>
          )}
          <Box
            component="ul"
            aria-label={many ? group.heading : menu.label}
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25, gridTemplateColumns: many ? '17rem' : 'repeat(2, 16.5rem)' }}
          >
            {group.items.map((item) => (
              <li key={item.label}>
                <MenuItem item={item} status={status} site={site} />
              </li>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function focusables(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')) : [];
}

type Geometry = { left: number; top: number; width: number; height: number };

/*
 * N5 floating pill with an N11 panel: Product ▾ · Resources ▾, then the CS2 status and Install
 * in the bar; the two menus share one panel that moves under the trigger,
 * resizes to the menu, and slides the contents in the direction of travel.
 * Below md the bar collapses to a menu button that opens a full-width sheet.
 *
 * The console renders the same nav with `site` (the main site's origin on the
 * console's own host, '' in development) so every site link leads back to
 * autotournament.gg, and `account`, the account menu on the right, which takes
 * the place of the Product menu's Console entry.
 */
export function SiteNav({ site = '', account }: { site?: string; account?: NavAccount } = {}) {
  const hydrated = useHydrated();
  const status = useCompatStatus(site);
  const scrollingDown = useScrollingDown();
  const menus = menusFor({ site, inConsole: account !== undefined });
  const [accountOpen, setAccountOpen] = useState(false);

  // `moving` is true when one open menu hands over to another: only then do
  // the panel's position, size and contents animate. Opening from closed places
  // the panel at once and fades it in.
  const [menu, setMenu] = useState<{ open: MenuId | null; last: MenuId; moving: boolean }>({ open: null, last: 'product', moving: false });
  const [sheet, setSheet] = useState(false);
  const [geo, setGeo] = useState<Geometry>({ left: 0, top: 0, width: 0, height: 0 });

  const open = menu.open;
  const shown = open ?? menu.last;
  const compact = scrollingDown && open === null && !sheet && !accountOpen;

  const headerRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLUListElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<MenuId, HTMLButtonElement | null>>>({});
  const sectionRefs = useRef<Partial<Record<MenuId, HTMLDivElement | null>>>({});
  const timer = useRef<number | undefined>(undefined);
  const hoverOpenedAt = useRef(0);
  const openRef = useRef<MenuId | null>(null);
  const pendingFocus = useRef<'first' | null>(null);
  openRef.current = open;

  const clearTimer = () => window.clearTimeout(timer.current);

  const openMenu = useCallback((id: MenuId) => {
    setAccountOpen(false);
    setMenu((m) => (m.open === id ? m : { open: id, last: id, moving: m.open !== null }));
  }, []);
  const closeMenu = useCallback(() => {
    window.clearTimeout(timer.current);
    setMenu((m) => (m.open === null ? m : { ...m, open: null, moving: false }));
  }, []);

  const onAccountOpenChange = useCallback(
    (next: boolean) => {
      if (next) closeMenu();
      setAccountOpen(next);
    },
    [closeMenu],
  );

  // Place and size the panel for the open menu. Layout offsets, not
  // getBoundingClientRect, so the pill's compact scale never skews them.
  const measure = useCallback(() => {
    const id = openRef.current;
    const header = headerRef.current;
    const pill = pillRef.current;
    const trigger = id && triggerRefs.current[id];
    const section = id && sectionRefs.current[id];
    if (!header || !pill || !trigger || !section) return;
    const width = section.offsetWidth;
    const height = section.offsetHeight;
    const center = pill.offsetLeft + trigger.offsetLeft + trigger.offsetWidth / 2;
    setGeo({ left: panelLeft(center, width, header.clientWidth), top: pill.offsetTop + pill.offsetHeight + PANEL_GAP, width, height });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    if (pendingFocus.current === 'first') {
      pendingFocus.current = null;
      focusables(sectionRefs.current[open] ?? null)[0]?.focus();
    }
  }, [open, measure]);

  // While a menu is open: re-place it on resize, close it on a click outside,
  // and close it when the window narrows to the phone layout.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) closeMenu();
    };
    const narrow = window.matchMedia('(max-width: 899.95px)');
    const onNarrow = () => narrow.matches && closeMenu();
    window.addEventListener('resize', measure);
    document.addEventListener('pointerdown', onPointerDown);
    narrow.addEventListener('change', onNarrow);
    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('pointerdown', onPointerDown);
      narrow.removeEventListener('change', onNarrow);
    };
  }, [open, measure, closeMenu]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The phone sheet: lock the page behind it, keep focus inside the header,
  // close on Escape and when the window widens to the desktop layout.
  useEffect(() => {
    if (!sheet) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (e: globalThis.KeyboardEvent) => {
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

  // --- pointer ---------------------------------------------------------------
  const isMouse = (e: PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen';

  const onTriggerEnter = (id: MenuId) => (e: PointerEvent) => {
    if (!isMouse(e)) return;
    clearTimer();
    if (openRef.current) {
      openMenu(id);
      return;
    }
    timer.current = window.setTimeout(() => {
      hoverOpenedAt.current = Date.now();
      openMenu(id);
    }, OPEN_DELAY);
  };
  const scheduleClose = (e: PointerEvent) => {
    if (!isMouse(e)) return;
    clearTimer();
    if (openRef.current) timer.current = window.setTimeout(closeMenu, CLOSE_DELAY);
  };
  const keepOpen = (e: PointerEvent) => {
    if (isMouse(e)) clearTimer();
  };

  const onTriggerClick = (id: MenuId) => () => {
    clearTimer();
    if (openRef.current !== id) {
      openMenu(id);
      return;
    }
    // The pointer opened it a moment ago; this click meant "open", not "close".
    if (Date.now() - hoverOpenedAt.current < HOVER_CLICK_GRACE) return;
    closeMenu();
  };

  // --- keyboard ----------------------------------------------------------------
  const barItems = () => (barRef.current ? Array.from(barRef.current.querySelectorAll<HTMLElement>('[data-bar-item]')) : []);

  const onBarKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = barItems();
    const index = items.indexOf(e.target as HTMLElement);
    if (index === -1) return;
    if (e.key === 'Escape' && openRef.current) {
      e.preventDefault();
      const trigger = triggerRefs.current[openRef.current];
      closeMenu();
      trigger?.focus();
      return;
    }
    const next = nextIndex(index, e.key, items.length);
    if (next !== null) {
      e.preventDefault();
      const target = items[next];
      target.focus();
      // With a menu open, arrowing onto the other trigger swaps the panel; onto a plain link closes it.
      if (openRef.current) {
        const id = target.dataset.menu as MenuId | undefined;
        if (id) openMenu(id);
        else closeMenu();
      }
      return;
    }
    const id = (e.target as HTMLElement).dataset.menu as MenuId | undefined;
    if (!id) return;
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey && openRef.current === id)) {
      e.preventDefault();
      if (openRef.current === id) focusables(sectionRefs.current[id] ?? null)[0]?.focus();
      else {
        pendingFocus.current = 'first';
        openMenu(id);
      }
    }
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const id = openRef.current;
    if (!id) return;
    const trigger = triggerRefs.current[id];
    const links = focusables(sectionRefs.current[id] ?? null);
    const index = links.indexOf(e.target as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      trigger?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      links[(index + step + links.length) % links.length]?.focus();
    } else if (e.key === 'Tab' && e.shiftKey && index === 0) {
      e.preventDefault();
      trigger?.focus();
    } else if (e.key === 'Tab' && !e.shiftKey && index === links.length - 1) {
      // Leave the panel to whatever follows the trigger in the bar.
      e.preventDefault();
      const items = barItems();
      const after = items[items.indexOf(trigger as HTMLElement) + 1] ?? focusables(rightRef.current)[0];
      closeMenu();
      after?.focus();
    }
  };

  // Focus that leaves the header (to the page, the address bar is fine) closes the menu.
  const onHeaderBlur = (e: React.FocusEvent<HTMLElement>) => {
    const to = e.relatedTarget as Node | null;
    if (openRef.current && to && !e.currentTarget.contains(to)) closeMenu();
  };

  const barItemSx = (active: boolean) =>
    ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0.5,
      px: 1.25,
      py: 0.75,
      border: 0,
      borderRadius: `${radius.pill}px`,
      bgcolor: active ? color.paper3 : 'transparent',
      color: active ? color.ink : color.ink2,
      font: 'inherit',
      lineHeight: 1.2,
      textDecoration: 'none',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      transition: `background-color ${duration.fast}ms ${ease.out}, color ${duration.fast}ms ${ease.out}`,
      ...noMotion,
      '&:hover': { color: color.ink },
      '&:active': { bgcolor: color.rule },
      '& .caret': { transition: `transform ${duration.base}ms ${ease.out}`, transform: active ? 'rotate(180deg)' : 'none', ...noMotion },
    }) as const;

  const trigger = (m: NavMenu) => {
    const active = open === m.id;
    const content: ReactNode = (
      <>
        {m.label}
        <CaretDown className="caret" size={12} weight="bold" aria-hidden />
      </>
    );
    // Before the script runs (or without it) the trigger is a link to the menu's main page.
    if (!hydrated) {
      return (
        <Box component="a" href={m.fallbackHref} data-bar-item="" sx={barItemSx(false)}>
          {content}
        </Box>
      );
    }
    return (
      <Box
        component="button"
        type="button"
        ref={(el: HTMLButtonElement | null) => {
          triggerRefs.current[m.id] = el;
        }}
        data-bar-item=""
        data-menu={m.id}
        aria-expanded={active}
        aria-controls={`nav-panel-${m.id}`}
        onClick={onTriggerClick(m.id)}
        onPointerEnter={onTriggerEnter(m.id)}
        onPointerLeave={scheduleClose}
        sx={barItemSx(active)}
      >
        {content}
      </Box>
    );
  };

  const [product, resources] = menus;
  const panelOpen = open !== null;
  const shownIndex = menus.findIndex((m) => m.id === shown);
  const slide = (moving: boolean) => (moving ? `${duration.base}ms ${ease.out}` : '0s');

  return (
    <Box ref={headerRef} component="header" onBlur={onHeaderBlur} sx={{ position: 'sticky', top: 16, zIndex: 10, display: 'flex', justifyContent: 'center', px: 2 }}>
      <Box
        ref={pillRef}
        data-compact={compact || undefined}
        sx={{
          position: 'relative',
          zIndex: 2,
          transform: compact ? 'translateY(-6px) scale(0.86)' : 'none',
          transformOrigin: 'top center',
          transition: `transform ${duration.base}ms ${ease.out}, background-color ${duration.base}ms ${ease.out}`,
          ...noMotion,
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1.5, sm: 2 },
          maxWidth: '100%',
          py: 1,
          pr: 1,
          pl: 2,
          bgcolor: color.navGlass,
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.pill}px`,
        }}
      >
        <Box
          component="a"
          href={siteHref('/', site)}
          aria-label="Auto Tournament, home"
          onPointerEnter={scheduleClose}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: { md: 1 }, textDecoration: 'none', color: 'inherit', fontFamily: fontDisplay, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          <AtIcon size={26} radius="7px" />
          {/* On the narrowest phones the icon stands alone, so the status dot, Install and the menu button still fit. */}
          <Box component="span" sx={{ '@media (max-width: 419.95px)': { display: 'none' } }}>
            Auto Tournament
          </Box>
        </Box>

        <Box component="nav" aria-label="Main" sx={{ display: { xs: 'none', md: 'block' } }}>
          <Box component="ul" ref={barRef} onKeyDown={onBarKeyDown} sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', alignItems: 'center', gap: 0.25, fontSize: '0.875rem' }}>
            <li>{trigger(product)}</li>
            <li>{trigger(resources)}</li>
          </Box>
        </Box>

        <Box ref={rightRef} onPointerEnter={scheduleClose} sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, ml: 'auto', fontSize: '0.875rem' }}>
          <CompatNavStatus status={status} href={siteHref(links.compatibility, site)} />
          <Button variant="contained" size="small" href={barLinks.install.href} {...externalProps(barLinks.install.href, site)} endIcon={<ArrowUpRight size={12} weight="bold" aria-hidden />} sx={{ whiteSpace: 'nowrap', '& .MuiButton-endIcon': { ml: 0.5 } }}>
            {barLinks.install.label}
            <Box component="span" sx={visuallyHidden}>
              (opens in a new tab)
            </Box>
          </Button>
          {account && (
            <AccountMenu
              account={account}
              hydrated={hydrated}
              open={accountOpen}
              onOpenChange={onAccountOpenChange}
            />
          )}
          {hydrated ? (
            <Box
              component="button"
              type="button"
              ref={menuButtonRef}
              aria-expanded={sheet}
              aria-controls="site-menu-sheet"
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
            // Without the script there is no sheet: the button jumps to the footer's links.
            <Box component="a" href="#site-links" aria-label="All links" sx={{ ...menuButtonSx, display: { xs: 'grid', md: 'none' } }}>
              <List size={18} weight="bold" aria-hidden />
            </Box>
          )}
        </Box>
      </Box>

      {/* Desktop: the one panel both menus share. */}
      {hydrated && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 1,
            display: { xs: 'none', md: 'block' },
            // The wrapper never takes the pointer; the panel does, while it is visible.
            pointerEvents: 'none',
            transform: `translate(${geo.left}px, ${geo.top}px)`,
            transition: `transform ${slide(menu.moving)}`,
            ...noMotion,
          }}
        >
          <Box
            ref={panelRef}
            data-testid="nav-panel"
            data-open={panelOpen || undefined}
            inert={!panelOpen}
            onPointerEnter={keepOpen}
            onPointerLeave={scheduleClose}
            onKeyDown={onPanelKeyDown}
            sx={{
              position: 'relative',
              pointerEvents: 'auto',
              width: geo.width,
              height: geo.height,
              overflow: 'hidden',
              // navGlass's colour at full opacity: text over the hero must not show through.
              bgcolor: color.paper2,
              border: `1px solid ${color.rule}`,
              borderRadius: `${radius.lg}px`,
              boxShadow: '0 24px 48px -24px rgba(0, 0, 0, 0.6)',
              opacity: panelOpen ? 1 : 0,
              visibility: panelOpen ? 'visible' : 'hidden',
              transform: panelOpen ? 'none' : 'translateY(-6px)',
              transition: [
                `opacity ${duration.fast}ms ${ease.out}`,
                `transform ${duration.base}ms ${ease.out}`,
                `visibility 0s linear ${panelOpen ? 0 : duration.fast}ms`,
                `width ${slide(menu.moving)}`,
                `height ${slide(menu.moving)}`,
              ].join(', '),
              ...noMotion,
              // A bridge over the gap above the panel, so the pointer never "leaves" on its way down.
              '&::before': { content: '""', position: 'absolute', left: 0, right: 0, top: -PANEL_GAP - 4, height: PANEL_GAP + 4 },
            }}
          >
            {menus.map((m, i) => {
              const active = m.id === shown;
              const offset = i < shownIndex ? -1 : i > shownIndex ? 1 : 0;
              return (
                <Box
                  key={m.id}
                  id={`nav-panel-${m.id}`}
                  ref={(el: HTMLDivElement | null) => {
                    sectionRefs.current[m.id] = el;
                  }}
                  inert={!active || !panelOpen}
                  aria-hidden={!active || undefined}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 'max-content',
                    opacity: active ? 1 : 0,
                    transform: `translateX(${offset * 40}px)`,
                    transition: `opacity ${slide(menu.moving)}, transform ${slide(menu.moving)}`,
                    ...noMotion,
                  }}
                >
                  <PanelSection menu={m} status={status} site={site} />
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Phones and tablets: the full-width sheet. */}
      {hydrated && (
        <Box
          ref={sheetRef}
          id="site-menu-sheet"
          data-testid="nav-sheet"
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
            {menus.map((m) => (
              <Box component="section" key={m.id} aria-labelledby={`sheet-${m.id}`}>
                <Box component="h2" id={`sheet-${m.id}`} sx={{ m: 0, mb: 0.5, px: 1.25, color: color.muted, fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'inherit' }}>
                  {m.label}
                </Box>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}>
                  {m.groups.flatMap((g) => g.items).map((item) => (
                    <li key={item.label}>
                      <MenuItem item={item} status={status} site={site} onNavigate={() => setSheet(false)} />
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
