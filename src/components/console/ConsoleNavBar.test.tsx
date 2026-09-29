// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('shows the customer area plain links and Buy, with aria-current on the active one, and no admin sections', () => {
    pathname = '/billing';
    render(<ConsoleNavBar base="" />);
    const nav = within(screen.getByRole('navigation', { name: 'Console' }));
    expect(nav.getByRole('link', { name: 'Billing' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Licenses' }).getAttribute('aria-current')).toBeNull();
    expect(nav.getByRole('link', { name: 'Team' })).toBeTruthy();
    expect(nav.getByRole('link', { name: 'Buy' })).toBeTruthy();
    expect(nav.queryByText('Sales')).toBeNull();
    expect(nav.queryByText('Audit log')).toBeNull();
  });

  it('shows the admin area as Overview plus four menus, with aria-current on the active item once its menu opens', () => {
    pathname = '/admin/leads';
    render(<ConsoleNavBar base="" />);
    const nav = within(screen.getByRole('navigation', { name: 'Console' }));
    expect(nav.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
    expect(nav.queryByRole('link', { name: 'Billing' })).toBeNull();

    const inboxTrigger = nav.getByRole('button', { name: /Inbox/ });
    fireEvent.click(inboxTrigger);
    expect(inboxTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(nav.getByRole('link', { name: 'Leads' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Free LANs' }).getAttribute('aria-current')).toBeNull();
  });

  it('closes an admin menu on Escape and returns focus to its trigger', () => {
    pathname = '/admin';
    render(<ConsoleNavBar base="" />);
    const nav = within(screen.getByRole('navigation', { name: 'Console' }));
    const salesTrigger = nav.getByRole('button', { name: /Sales/ });
    fireEvent.click(salesTrigger);
    expect(salesTrigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(nav.getByRole('link', { name: 'Licenses' }), { key: 'Escape' });
    expect(salesTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(salesTrigger);
  });

  it('signed out, on a page with no area, shows only the back link, the logo and Sign in', () => {
    pathname = '/signin';
    render(<ConsoleNavBar base="" account={{ signedIn: false, signIn: '/signin' }} />);
    expect(screen.getByRole('link', { name: 'Back to autotournament.gg' })).toBeTruthy();
    expect(screen.getByTestId('nav-sign-in')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Licenses' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
  });

  it('shows the organization switcher menu only with more than one organization', () => {
    const { rerender } = render(<ConsoleNavBar base="" org={org} />);
    expect(screen.getByRole('button', { name: 'Organization' })).toBeTruthy();

    rerender(<ConsoleNavBar base="" org={{ ...org, orgs: [org.orgs[0]] }} />);
    expect(screen.queryByRole('button', { name: 'Organization' })).toBeNull();
  });

  it('opens the organization switcher and lists the other organization', () => {
    render(<ConsoleNavBar base="" org={org} />);
    const trigger = screen.getByRole('button', { name: 'Organization' });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Beta LAN' })).toBeTruthy();
  });
});
