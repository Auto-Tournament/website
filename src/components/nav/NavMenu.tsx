'use client';

/* Hallmark · component: nav dropdown menu (N11 panel look, single-trigger) · genre: modern-minimal · theme: Auto Tournament system
 * states: default · hover · focus · active (open); contrast: ink2 on navGlass, ink on paper2; focus ring from the theme.
 *
 * A single trigger with its own panel: hover opens (with a short delay so
 * passing over it doesn't), a click toggles it, Escape closes it and returns
 * focus to the trigger, and the arrow keys move within the panel. Same look
 * as SiteNav's shared Product/Resources panel (paper2 fill, rule border,
 * radius.lg, drop shadow, no backdrop blur) and the same open/close timing,
 * generalised to a single independent panel per trigger — the shape the
 * console's several menus need, instead of the one panel the site's two
 * menus share and slide between.
 */

import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';

const { color, radius, ease, duration } = tokens;

/** Wait this long on a trigger before its panel opens, so passing over it doesn't. */
const OPEN_DELAY = 80;
/** Wait this long after the pointer leaves before closing, so it can travel into the panel. */
const CLOSE_DELAY = 150;
/** A click this soon after hover opened the panel keeps it open instead of toggling it shut. */
const HOVER_CLICK_GRACE = 400;

const noMotion = { '@media (prefers-reduced-motion: reduce)': { transition: 'none' } } as const;

function focusables(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')) : [];
}

export const navMenuTriggerSx = (active: boolean) =>
  ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    px: 1.25,
    py: 0.75,
    border: 0,
    borderRadius: `${radius.pill}px`,
    bgcolor: active ? color.paper3 : 'transparent',
    color: active ? `${color.ink} !important` : `${color.ink2} !important`,
    font: 'inherit',
    fontSize: '0.875rem',
    lineHeight: 1.2,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: `background-color ${duration.fast}ms ${ease.out}, color ${duration.fast}ms ${ease.out}`,
    ...noMotion,
    '&:hover': { color: `${color.ink} !important`, bgcolor: active ? color.paper3 : color.rule },
    '& .nav-menu-caret': { transition: `transform ${duration.base}ms ${ease.out}`, transform: active ? 'rotate(180deg)' : 'none', ...noMotion },
  }) as const;

/** One destination in a NavMenu panel: label and a one-line note under it. */
export function NavMenuItem({ href, label, note, active, onNavigate }: { href: string; label: string; note?: string; active?: boolean; onNavigate?: () => void }) {
  return (
    <Box
      component="a"
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      sx={{
        display: 'grid',
        gap: 0.25,
        width: '100%',
        p: 1.25,
        borderRadius: `${radius.md}px`,
        bgcolor: active ? color.paper3 : 'transparent',
        color: `${color.ink} !important`,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        transition: `background-color ${duration.fast}ms ${ease.out}`,
        ...noMotion,
        '&:hover, &:focus-visible': { bgcolor: color.paper3 },
        '&:active': { bgcolor: color.rule },
        '&:focus-visible': { outlineOffset: 0 },
      }}
    >
      <Box component="span" sx={{ fontSize: '0.9375rem', fontWeight: active ? 700 : 600, lineHeight: 1.3 }}>
        {label}
      </Box>
      {note && (
        <Box component="span" sx={{ color: color.muted, fontSize: '0.8125rem', lineHeight: 1.45, whiteSpace: 'normal' }}>
          {note}
        </Box>
      )}
    </Box>
  );
}

export function NavMenu({
  id,
  trigger,
  ariaLabel,
  panelLabel,
  align = 'left',
  width = '17rem',
  hydrated,
  fallbackHref,
  children,
}: {
  id: string;
  /** Content inside the trigger button, e.g. the label and a caret icon. */
  trigger: ReactNode;
  ariaLabel?: string;
  /** Accessible name for the panel's menu role. */
  panelLabel: string;
  /** Which edge of the trigger the panel's matching edge aligns to. */
  align?: 'left' | 'right';
  width?: string;
  /** false while the server renders and during hydration: the trigger is a plain link until then. */
  hydrated: boolean;
  /** Where the trigger points before the page's script runs. */
  fallbackHref: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const hoverOpenedAt = useRef(0);
  const pendingFocus = useRef(false);

  const clearTimer = () => window.clearTimeout(timer.current);
  const close = (refocus = false) => {
    clearTimer();
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (open && pendingFocus.current) {
      pendingFocus.current = false;
      focusables(panelRef.current)[0]?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => () => clearTimer(), []);

  const isMouse = (e: PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen';

  const onTriggerEnter = (e: PointerEvent) => {
    if (!isMouse(e)) return;
    clearTimer();
    timer.current = window.setTimeout(() => {
      hoverOpenedAt.current = Date.now();
      setOpen(true);
    }, OPEN_DELAY);
  };
  const scheduleClose = (e: PointerEvent) => {
    if (!isMouse(e)) return;
    clearTimer();
    if (open) timer.current = window.setTimeout(() => close(), CLOSE_DELAY);
  };
  const keepOpen = (e: PointerEvent) => {
    if (isMouse(e)) clearTimer();
  };

  const onTriggerClick = () => {
    clearTimer();
    if (!open) {
      setOpen(true);
      return;
    }
    // The pointer opened it a moment ago; this click meant "open", not "close".
    if (Date.now() - hoverOpenedAt.current < HOVER_CLICK_GRACE) return;
    close();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open) focusables(panelRef.current)[0]?.focus();
      else {
        pendingFocus.current = true;
        setOpen(true);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      close(true);
    }
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = focusables(panelRef.current);
    const index = items.indexOf(e.target as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab' && !e.shiftKey && index === items.length - 1) {
      close();
    } else if (e.key === 'Tab' && e.shiftKey && index === 0) {
      e.preventDefault();
      buttonRef.current?.focus();
    }
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget as Node | null;
    if (open && to && !e.currentTarget.contains(to)) close();
  };

  if (!hydrated) {
    return (
      <Box component="a" href={fallbackHref} aria-label={ariaLabel} sx={navMenuTriggerSx(false)}>
        {trigger}
      </Box>
    );
  }

  return (
    <Box ref={wrapRef} onPointerLeave={scheduleClose} onBlur={onBlur} sx={{ position: 'relative' }}>
      <Box
        component="button"
        type="button"
        ref={buttonRef}
        data-testid={`${id}-trigger`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onTriggerClick}
        onPointerEnter={onTriggerEnter}
        onKeyDown={onTriggerKeyDown}
        sx={navMenuTriggerSx(open)}
      >
        {trigger}
      </Box>
      <Box
        ref={panelRef}
        id={`${id}-panel`}
        data-testid={`${id}-panel`}
        aria-label={panelLabel}
        data-open={open || undefined}
        inert={!open}
        onPointerEnter={keepOpen}
        onKeyDown={onPanelKeyDown}
        sx={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          [align]: 0,
          zIndex: 5,
          boxSizing: 'border-box',
          width: `min(${width}, calc(100vw - 32px))`,
          p: 1,
          display: 'grid',
          gap: 0.25,
          // navGlass's colour at full opacity: text over the page must not show through, and no backdrop blur.
          bgcolor: color.paper2,
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.lg}px`,
          boxShadow: '0 24px 48px -24px rgba(0, 0, 0, 0.6)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          transform: open ? 'none' : 'translateY(-6px)',
          transition: `opacity ${duration.fast}ms ${ease.out}, transform ${duration.base}ms ${ease.out}, visibility 0s linear ${open ? 0 : duration.fast}ms`,
          ...noMotion,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
