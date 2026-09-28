import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_PACKS,
  founderBadge,
  founderLifetime,
  founderPitch,
  founderShutdownPromise,
  founderTerms,
  founderUpgradeExample,
  neverLockOut,
  periodLabels,
} from './pricing';

/** The PACKS table in the seed script, parsed from its source (the script runs on import). */
function seedTable(): { id: string; maxServers: number; prices: Record<string, number> }[] {
  const src = readFileSync(fileURLToPath(new URL('../../scripts/stripe-seed-packs.mjs', import.meta.url)), 'utf8');
  const row = /\{ id: '([a-z-]+)', product: '\w+', size: '\w', maxServers: (\d+), prices: \{ event: (\d+), year: (\d+), founder: (\d+) \} \}/g;
  return [...src.matchAll(row)].map((m) => ({
    id: m[1],
    maxServers: Number(m[2]),
    prices: { event: Number(m[3]), year: Number(m[4]), founder: Number(m[5]) },
  }));
}

describe('founder prices', () => {
  it('are the lifetime founder prices', () => {
    expect(Object.fromEntries(FALLBACK_PACKS.map((p) => [p.id, p.prices.founder / 100]))).toEqual({
      'servers-s': 149,
      'servers-m': 389,
      'servers-l': 799,
      'platform-s': 299,
      'platform-m': 649,
      'platform-l': 1199,
    });
  });

  it('go up with the pack size', () => {
    for (const product of ['servers', 'platform']) {
      const [s, m, l] = ['s', 'm', 'l'].map((size) => FALLBACK_PACKS.find((p) => p.id === `${product}-${size}`)!.prices.founder);
      expect(s).toBeLessThan(m);
      expect(m).toBeLessThan(l);
    }
  });

  it('match the seed script table, in whole euros', () => {
    const seed = seedTable();
    expect(seed).toHaveLength(6);
    expect(seed).toEqual(
      FALLBACK_PACKS.map((p) => ({
        id: p.id,
        maxServers: p.maxServers,
        prices: { event: p.prices.event / 100, year: p.prices.year / 100, founder: p.prices.founder / 100 },
      })),
    );
  });
});

describe('founder copy', () => {
  const terms = founderTerms(FALLBACK_PACKS).join(' ');

  it('promises lifetime updates, not a year of them', () => {
    expect(founderPitch).toContain('lifetime updates');
    expect(founderPitch).toContain(founderLifetime);
    expect(terms).toContain(founderLifetime);
    expect(periodLabels.founder).toContain('lifetime updates');
    for (const text of [terms, founderPitch, periodLabels.founder]) {
      expect(text).not.toMatch(/12 months|1 year|perpetual|renew/i);
    }
  });

  it('keeps the limit', () => {
    expect(founderBadge).toBe('Limited: first 25 or until 31 March 2027');
    expect(terms).toContain('first 25 buyers, or until 31 March 2027');
  });

  it('prices a size upgrade as the founder price difference', () => {
    expect(founderUpgradeExample(FALLBACK_PACKS)).toBe('Servers M to Servers L costs €410');
    expect(founderUpgradeExample(FALLBACK_PACKS, 'platform')).toBe('Platform M to Platform L costs €550');
    expect(terms).toContain('Servers M to Servers L costs €410');
  });

  it('includes the shutdown promise and never locks anyone out', () => {
    expect(founderTerms(FALLBACK_PACKS)).toContain(founderShutdownPromise);
    expect(founderShutdownPromise).toContain('final build without the license check');
    expect(neverLockOut).toMatch(/^We never lock you out\./);
    expect(neverLockOut).toContain('never stops the software');
  });
});
