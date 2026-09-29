import { describe, expect, it } from 'vitest';
import { accountLinks, activeSection, navArea, sectionLinks, sections } from './consoleNav';

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

describe('console sub-nav', () => {
  it('lists the organization sections and the admin sections', () => {
    expect(sections.org.map((s) => s.label)).toEqual(['Licenses', 'Members', 'Billing', 'Buy']);
    expect(sections.admin.map((s) => s.label)).toEqual(['Overview', 'Licenses', 'New license', 'Organizations', 'Users', 'Leads', 'Free LANs', 'Audit log', 'Passkeys']);
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
