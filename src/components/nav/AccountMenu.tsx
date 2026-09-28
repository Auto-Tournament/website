'use client';

/* The console's account menu on the right of the site nav: who is signed in,
 * then Console home, Admin (admins), Add an organization and Sign out.
 * Signed out it is a plain "Sign in" link. Only rendered on the console. */

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import Box from '@mui/material/Box';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { SignOut } from '@phosphor-icons/react/dist/csr/SignOut';
import { UserCircle } from '@phosphor-icons/react/dist/csr/UserCircle';
import { tokens } from '@/theme/tokens';
import type { ConsoleLink } from '../console/consoleNav';

const { color, radius, ease, duration } = tokens;

export type NavAccount =
  | { signedIn: true; email: string | null; links: ConsoleLink[]; signOut: () => Promise<void> }
  | { signedIn: false; signIn: string };

const noMotion = { '@media (prefers-reduced-motion: reduce)': { transition: 'none' } } as const;

const triggerSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.75,
  minWidth: 36,
  height: 36,
  px: 1,
  border: `1px solid ${color.rule}`,
  borderRadius: `${radius.pill}px`,
  bgcolor: 'transparent',
  color: color.ink,
  font: 'inherit',
  fontSize: '0.875rem',
  lineHeight: 1.2,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: `background-color ${duration.fast}ms ${ease.out}`,
  ...noMotion,
  '&:hover': { bgcolor: color.paper3 },
  '&:active': { bgcolor: color.rule },
} as const;

const itemSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  width: '100%',
  px: 1.25,
  py: 1,
  border: 0,
  borderRadius: `${radius.md}px`,
  bgcolor: 'transparent',
  color: color.ink,
  font: 'inherit',
  fontSize: '0.9375rem',
  textAlign: 'left',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  '&:hover, &:focus-visible': { bgcolor: color.paper3 },
  '&:active': { bgcolor: color.rule },
  '&:focus-visible': { outlineOffset: 0 },
} as const;

function focusables(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')) : [];
}

export function AccountMenu({
  account,
  hydrated,
  open,
  onOpenChange,
}: {
  account: NavAccount;
  hydrated: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusFirst = useRef(false);

  useLayoutEffect(() => {
    if (open && focusFirst.current) {
      focusFirst.current = false;
      focusables(panelRef.current)[0]?.focus();
    }
  }, [open]);

  // A click anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onOpenChange]);

  if (!account.signedIn) {
    return (
      <Box component="a" href={account.signIn} data-testid="nav-sign-in" sx={{ ...triggerSx, px: 1.5 }}>
        Sign in
      </Box>
    );
  }

  const email = account.email ?? 'Signed in';
  const label = (
    <>
      <UserCircle size={18} aria-hidden style={{ flex: 'none' }} />
      {/* Phones show the icon alone; the address is still the button's name. */}
      <Box
        component="span"
        data-testid="signed-in-as"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: { sm: '10rem', lg: '14rem' },
          '@media (max-width: 599.95px)': { position: 'absolute', width: '1px', height: '1px', margin: '-1px', clip: 'rect(0 0 0 0)' },
        }}
      >
        {email}
      </Box>
    </>
  );

  // Before the script runs the menu can't open: the button is a link to the console's home.
  if (!hydrated) {
    return (
      <Box component="a" href={account.links[0]?.href ?? '/'} aria-label={`Account (${email})`} sx={triggerSx}>
        {label}
      </Box>
    );
  }

  const close = (refocus: boolean) => {
    onOpenChange(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open) focusables(panelRef.current)[0]?.focus();
      else {
        focusFirst.current = true;
        onOpenChange(true);
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
    }
  };

  return (
    <Box
      ref={wrapRef}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const to = e.relatedTarget as Node | null;
        if (open && to && !e.currentTarget.contains(to)) onOpenChange(false);
      }}
    >
      <Box
        component="button"
        type="button"
        ref={buttonRef}
        data-testid="account-button"
        aria-label={`Account (${email})`}
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => onOpenChange(!open)}
        onKeyDown={onButtonKeyDown}
        sx={{ ...triggerSx, bgcolor: open ? color.paper3 : 'transparent', '& .caret': { transition: `transform ${duration.base}ms ${ease.out}`, transform: open ? 'rotate(180deg)' : 'none', ...noMotion } }}
      >
        {label}
        <CaretDown className="caret" size={12} weight="bold" aria-hidden style={{ flex: 'none' }} />
      </Box>
      <Box
        ref={panelRef}
        id="account-menu"
        data-testid="account-menu"
        data-open={open || undefined}
        inert={!open}
        onKeyDown={onPanelKeyDown}
        sx={{
          // Under the pill's right end (the pill is the positioned box), never wider than the screen.
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          boxSizing: 'border-box',
          width: 'min(18rem, calc(100vw - 32px))',
          p: 1,
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
        <Box component="p" sx={{ m: 0, px: 1.25, pt: 0.5, pb: 1, color: color.muted, fontSize: '0.8125rem', overflowWrap: 'anywhere' }}>
          Signed in as <Box component="span" sx={{ color: color.ink2 }}>{email}</Box>
        </Box>
        <Box component="ul" aria-label="Account" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.25 }}>
          {account.links.map((l) => (
            <li key={l.href}>
              <Box component="a" href={l.href} sx={itemSx}>
                {l.label}
              </Box>
            </li>
          ))}
          <Box component="li" sx={{ mt: 0.5, pt: 0.5, borderTop: `1px solid ${color.rule}` }}>
            <Box component="form" action={account.signOut} sx={{ m: 0 }}>
              <Box component="button" type="submit" sx={itemSx}>
                <SignOut size={16} aria-hidden />
                Sign out
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
