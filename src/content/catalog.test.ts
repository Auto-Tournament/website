import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findGame, findTool, games, gamesWithPages, platform, productPaths } from './catalog';
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
    const text = JSON.stringify({ platform, games });
    expect(text).not.toMatch(/full price/i);
    expect(text).not.toMatch(/matchzy/i);
  });

  it('links the platform and every game with a page from the nav', () => {
    const hrefs = menus.flatMap((m) => m.groups.flatMap((g) => g.items.map((i) => i.href)));
    expect(hrefs).toContain('/platform');
    expect(hrefs).toContain('/games');
    for (const g of gamesWithPages) expect(hrefs).toContain(`/games/${g.slug}`);
  });
});
