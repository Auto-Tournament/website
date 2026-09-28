import { describe, expect, it } from 'vitest';
import { barLinks, isExternal, menus, menusFor, nextIndex, panelLeft, siteHref } from './navItems';

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

describe('site links from the console', () => {
  const site = 'https://autotournament.gg';
  const items = (m: typeof menus) => m.flatMap((x) => x.groups.flatMap((g) => g.items));

  it('keeps site paths relative on the main site and in development', () => {
    expect(siteHref('/pricing')).toBe('/pricing');
    expect(siteHref('/#features', '')).toBe('/#features');
  });

  it('makes site paths absolute on the console host; URLs and anchors pass through', () => {
    expect(siteHref('/pricing', site)).toBe('https://autotournament.gg/pricing');
    expect(siteHref('/#features', site)).toBe('https://autotournament.gg/#features');
    expect(siteHref('/', site)).toBe('https://autotournament.gg/');
    expect(siteHref('/verify', `${site}/`)).toBe('https://autotournament.gg/verify');
    expect(siteHref('https://docs.autotournament.gg', site)).toBe('https://docs.autotournament.gg');
    expect(siteHref('#site-links', site)).toBe('#site-links');
    expect(siteHref('//evil.example', site)).toBe('//evil.example');
  });

  it('keeps absolute links to the main site in the tab', () => {
    expect(isExternal('https://autotournament.gg/pricing', site)).toBe(false);
    expect(isExternal('https://autotournament.gg', site)).toBe(false);
    expect(isExternal('https://autotournament.gg.evil.example/x', site)).toBe(true);
    expect(isExternal('https://docs.autotournament.gg', site)).toBe(true);
  });

  it('on the main site: the menus as they are, Console inside Product', () => {
    expect(menusFor()).toEqual(menus);
    expect(items(menusFor()).some((i) => i.icon === 'console')).toBe(true);
  });

  it('on the console host: every site link absolute, no Console entry (the account menu has it), no duplicate hrefs', () => {
    const m = menusFor({ site, inConsole: true });
    const all = items(m);
    expect(all.some((i) => i.icon === 'console')).toBe(false);
    for (const i of all) expect(i.href).toMatch(/^https:\/\//);
    expect(all.find((i) => i.label === 'Features')?.href).toBe('https://autotournament.gg/#features');
    expect(all.find((i) => i.label === 'Pricing')?.href).toBe('https://autotournament.gg/pricing');
    expect(m.find((x) => x.id === 'product')?.fallbackHref).toBe('https://autotournament.gg/#features');
    const hrefs = [barLinks.install.href, ...all.map((i) => i.href)];
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('in development the console keeps relative links', () => {
    const all = items(menusFor({ site: '', inConsole: true }));
    expect(all.find((i) => i.label === 'Pricing')?.href).toBe('/pricing');
  });
});
