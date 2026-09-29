import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findGame, findTool, games, gamesWithPages, licensing, platform, productPaths, readyUpFeatures, releases } from './catalog';
import { menus } from '../components/nav/navItems';

describe('product catalog', () => {
  it('gives every page a unique path', () => {
    const paths = productPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(expect.arrayContaining(['/platform', '/games', '/games/cs2', '/games/cs2/ready-up', '/games/cs2/csm']));
  });

  it('finds games and tools by slug, and nothing else', () => {
    expect(findGame('cs2')?.name).toBe('Counter-Strike 2');
    expect(findTool('cs2', 'ready-up')?.tool.name).toBe('Ready Up');
    expect(findGame('rocket-league')).toBeUndefined(); // listed, no page
    expect(findTool('cs2', 'nope')).toBeUndefined();
  });

  it('has an app icon in public/ for every game', () => {
    for (const g of games) expect(existsSync(join(process.cwd(), 'public', g.image)), g.image).toBe(true);
  });

  it('keeps unique game slugs and unique section ids per page', () => {
    expect(new Set(games.map((g) => g.slug)).size).toBe(games.length);
    for (const p of [platform, ...gamesWithPages.flatMap((g) => g.tools)]) {
      const ids = p.sections.map((s) => s.id);
      expect(new Set(ids).size, p.name).toBe(ids.length);
    }
  });

  it('follows the wording rules: no "full price", no MatchZy branding', () => {
    const text = JSON.stringify({ platform, games, licensing });
    expect(text).not.toMatch(/full price/i);
    expect(text).not.toMatch(/matchzy/i);
    expect(text).not.toMatch(/personal use/i);
    expect(licensing.headline).toBe('Free for non-commercial use');
  });

  it('drives the status labels from releases', () => {
    const readyUp = findTool('cs2', 'ready-up')!.tool;
    const csm = findTool('cs2', 'csm')!.tool;
    expect(readyUp.badges[0].label).toBe(releases.readyUp ? `Beta: ${releases.readyUp}` : 'No release yet');
    expect(csm.badges[0].label).toBe(`v${releases.csm}`);
    expect(platform.badges.map((b) => b.label)).toContain(`3.0 beta ${releases.platformBeta}`);
    const text = JSON.stringify({ platform, csm });
    expect(text.includes('Next csm release')).toBe(!releases.csmHasFleet);
    expect(text.includes('Coming in 3.0')).toBe(!releases.platformHasFleet);
  });

  it('lists Ready Up features with unique titles, non-empty', () => {
    expect(readyUpFeatures.length).toBeGreaterThan(0);
    const titles = readyUpFeatures.flatMap((g) => g.items.map((i) => i.title));
    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(titles.length);
    const groupIds = readyUpFeatures.map((g) => g.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);
  });

  it('links the platform and every game with a page from the nav', () => {
    const hrefs = menus.flatMap((m) => m.groups.flatMap((g) => g.items.map((i) => i.href)));
    expect(hrefs).toContain('/platform');
    expect(hrefs).toContain('/games');
    for (const g of gamesWithPages) expect(hrefs).toContain(`/games/${g.slug}`);
  });
});
