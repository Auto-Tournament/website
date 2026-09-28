import { describe, expect, it } from 'vitest';
import { barLinks, isExternal, menus, nextIndex, panelLeft } from './navItems';

describe('site nav items', () => {
  it('keeps every destination reachable: each link is a site path or an https URL', () => {
    const all = [...Object.values(barLinks), ...menus.flatMap((m) => m.groups.flatMap((g) => g.items))];
    for (const l of all) expect(l.href).toMatch(/^(\/|#|https:\/\/)/);
    const labels = all.map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('never points two places at the same destination: no href repeats across the bar and the menus', () => {
    const all = [...Object.values(barLinks), ...menus.flatMap((m) => m.groups.flatMap((g) => g.items))];
    const hrefs = all.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    // The Install button is the only link to the install guide.
    expect(menus.flatMap((m) => m.groups.flatMap((g) => g.items)).some((item) => item.href === barLinks.install.href)).toBe(false);
  });

  it('gives every menu item a one-line note', () => {
    for (const item of menus.flatMap((m) => m.groups.flatMap((g) => g.items))) {
      expect(item.note.length).toBeGreaterThan(10);
      expect(item.note.length).toBeLessThanOrEqual(60);
    }
  });

  it('treats only absolute http(s) links as external', () => {
    expect(isExternal('https://docs.autotournament.gg')).toBe(true);
    expect(isExternal('/pricing')).toBe(false);
    expect(isExternal('/#features')).toBe(false);
    expect(isExternal('#site-links')).toBe(false);
  });
});

describe('panelLeft', () => {
  it('centres the panel under the trigger', () => {
    expect(panelLeft(500, 400, 1200)).toBe(300);
  });

  it('keeps the panel inside the header gutters', () => {
    expect(panelLeft(100, 400, 1200)).toBe(16);
    expect(panelLeft(1150, 400, 1200)).toBe(784);
  });

  it('centres a panel too wide for the gutters', () => {
    expect(panelLeft(100, 1000, 900)).toBe(0);
    expect(panelLeft(100, 880, 900)).toBe(10);
  });
});

describe('nextIndex', () => {
  it('moves and wraps with the arrow keys, jumps with Home and End', () => {
    expect(nextIndex(0, 'ArrowRight', 4)).toBe(1);
    expect(nextIndex(3, 'ArrowRight', 4)).toBe(0);
    expect(nextIndex(0, 'ArrowLeft', 4)).toBe(3);
    expect(nextIndex(2, 'Home', 4)).toBe(0);
    expect(nextIndex(0, 'End', 4)).toBe(3);
    expect(nextIndex(1, 'Enter', 4)).toBeNull();
    expect(nextIndex(0, 'ArrowRight', 0)).toBeNull();
  });
});
