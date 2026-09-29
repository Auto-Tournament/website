import { describe, expect, it } from 'vitest';
import { accountLinks, activeSection, navArea, navEntries, navEntriesFor, navGroups, sectionLinks, sections } from './consoleNav';

describe('account menu', () => {
  it('shows Admin only to admins', () => {
    expect(accountLinks({ base: '', isAdmin: false }).map((l) => l.label)).toEqual(['Console home', 'Add an organization']);
    expect(accountLinks({ base: '', isAdmin: true })).toEqual([
      { label: 'Console home', href: '/licenses' },
      { label: 'Admin', href: '/admin' },
      { label: 'Add an organization', href: '/welcome' },
    ]);
  });

  it('prefixes /console in development', () => {
    expect(accountLinks({ base: '/console', isAdmin: true }).map((l) => l.href)).toEqual(['/console/licenses', '/console/admin', '/console/welcome']);
  });
});

describe('console nav entries', () => {
  it('gives the customer area plain links and a Buy button, no menus', () => {
    expect(navEntries.org.map((e) => e.kind)).toEqual(['link', 'link', 'link', 'button']);
    expect(navEntries.org.map((e) => e.label)).toEqual(['Licenses', 'Team', 'Billing', 'Buy']);
  });

  it('groups the admin area into Overview plus four menus, each item with a note', () => {
    expect(navEntries.admin.map((e) => e.kind)).toEqual(['link', 'menu', 'menu', 'menu', 'menu']);
    const menus = navEntries.admin.filter((e) => e.kind === 'menu');
    expect(menus.map((m) => m.label)).toEqual(['Sales', 'Customers', 'Inbox', 'Security']);
    expect(menus.find((m) => m.label === 'Sales')?.items.map((i) => i.label)).toEqual(['Licenses', 'New license']);
    expect(menus.find((m) => m.label === 'Customers')?.items.map((i) => i.label)).toEqual(['Organizations', 'Users']);
    expect(menus.find((m) => m.label === 'Inbox')?.items.map((i) => i.label)).toEqual(['Leads', 'Free LANs']);
    expect(menus.find((m) => m.label === 'Security')?.items.map((i) => i.label)).toEqual(['Passkeys', 'Audit log']);
    for (const m of menus) for (const item of m.items) expect(item.note?.length).toBeGreaterThan(10);
  });

  it('never points two places at the same destination, across both areas', () => {
    for (const area of ['org', 'admin'] as const) {
      const hrefs = sections[area].map((s) => s.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it('prefixes hrefs with the console base', () => {
    const admin = navEntriesFor('admin', '/console');
    const sales = admin.find((e) => e.kind === 'menu' && e.label === 'Sales');
    expect(sales?.kind === 'menu' && sales.items[0].href).toBe('/console/admin/licenses');
    const overview = admin.find((e) => e.kind === 'link');
    expect(overview?.kind === 'link' && overview.href).toBe('/console/admin');
  });

  it('groups the phone sheet: plain links share one section, each menu its own heading', () => {
    const orgGroups = navGroups('org', '');
    expect(orgGroups).toHaveLength(1);
    expect(orgGroups[0].items.map((i) => i.label)).toEqual(['Licenses', 'Team', 'Billing', 'Buy']);

    const adminGroups = navGroups('admin', '');
    expect(adminGroups.map((g) => g.heading)).toEqual([undefined, 'Sales', 'Customers', 'Inbox', 'Security']);
    expect(adminGroups[0].items.map((i) => i.label)).toEqual(['Overview']);
  });
});

describe('console sub-nav', () => {
  it('lists the organization sections and the admin sections', () => {
    expect(sections.org.map((s) => s.label)).toEqual(['Licenses', 'Team', 'Billing', 'Buy']);
    expect(sections.admin.map((s) => s.label)).toEqual(['Overview', 'Licenses', 'New license', 'Organizations', 'Users', 'Leads', 'Free LANs', 'Passkeys', 'Audit log']);
    for (const area of ['org', 'admin'] as const) {
      const hrefs = sections[area].map((s) => s.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
    expect(sectionLinks('org', '/console')[0]).toEqual({ label: 'Licenses', href: '/console/licenses' });
  });

  it('marks the section a page is in, with or without the /console prefix', () => {
    expect(activeSection('org', '/members')).toBe('/members');
    expect(activeSection('org', '/console/billing')).toBe('/billing');
    expect(activeSection('org', '/welcome')).toBeNull();
    expect(activeSection('admin', '/admin')).toBe('/admin');
    expect(activeSection('admin', '/console/admin')).toBe('/admin');
    expect(activeSection('admin', '/admin/leads/abc')).toBe('/admin/leads');
    expect(activeSection('admin', '/admin/licenses/new')).toBe('/admin/licenses/new');
    expect(activeSection('admin', '/admin/licenses/L-1')).toBe('/admin/licenses');
    expect(activeSection('admin', '/admin/orders/o1')).toBeNull();
  });
});

describe('the single console nav bar', () => {
  it('places a page in the admin or organization area, or neither', () => {
    expect(navArea('/admin')).toBe('admin');
    expect(navArea('/console/admin/leads')).toBe('admin');
    expect(navArea('/licenses')).toBe('org');
    expect(navArea('/console/billing')).toBe('org');
    expect(navArea('/signin')).toBeNull();
    expect(navArea('/welcome')).toBeNull();
    expect(navArea('/invite')).toBeNull();
  });
});
