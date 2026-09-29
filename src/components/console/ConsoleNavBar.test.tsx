// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ActionState } from '@/app/console/actions';
import { ConsoleNavBar, type ConsoleOrgSwitch } from './ConsoleNavBar';

let pathname = '/licenses';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

afterEach(() => {
  cleanup();
  pathname = '/licenses';
});

const org: ConsoleOrgSwitch = {
  orgs: [
    { id: 'o1', name: 'Alpha LAN' },
    { id: 'o2', name: 'Beta LAN' },
  ],
  current: 'o1',
  action: async (): Promise<ActionState> => null,
};

describe('ConsoleNavBar', () => {
  it('links back to the main site', () => {
    render(<ConsoleNavBar base="" />);
    const back = screen.getByRole('link', { name: 'Back to autotournament.gg' });
    expect(back.getAttribute('href')).toBe('https://autotournament.gg');
  });

  it('shows the organization sections with aria-current on the active one, and no admin sections', () => {
    pathname = '/billing';
    render(<ConsoleNavBar base="" />);
    const nav = within(screen.getByRole('navigation', { name: 'Console' }));
    expect(nav.getByRole('link', { name: 'Billing' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Licenses' }).getAttribute('aria-current')).toBeNull();
    expect(nav.queryByRole('link', { name: 'Audit log' })).toBeNull();
  });

  it('shows the admin sections with aria-current on the active one, and no organization sections', () => {
    pathname = '/admin/leads';
    render(<ConsoleNavBar base="" />);
    const nav = within(screen.getByRole('navigation', { name: 'Console' }));
    expect(nav.getByRole('link', { name: 'Leads' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
    expect(nav.queryByRole('link', { name: 'Billing' })).toBeNull();
  });

  it('signed out, on a page with no area, shows only the back link, the logo and Sign in', () => {
    pathname = '/signin';
    render(<ConsoleNavBar base="" account={{ signedIn: false, signIn: '/signin' }} />);
    expect(screen.getByRole('link', { name: 'Back to autotournament.gg' })).toBeTruthy();
    expect(screen.getByTestId('nav-sign-in')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Licenses' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
  });

  it('shows the organization switcher only with more than one organization', () => {
    const { rerender } = render(<ConsoleNavBar base="" org={org} />);
    expect(screen.getByLabelText('Organization')).toBeTruthy();

    rerender(<ConsoleNavBar base="" org={{ ...org, orgs: [org.orgs[0]] }} />);
    expect(screen.queryByLabelText('Organization')).toBeNull();
  });
});
