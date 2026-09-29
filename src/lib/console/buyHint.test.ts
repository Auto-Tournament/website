import { describe, expect, it } from 'vitest';
import { FALLBACK_PACKS } from '../../components/pricing';
import type { LicensePayload } from '../license/format';
import { buyHint } from './buyHint';

const lic = (over: Partial<LicensePayload>): LicensePayload => ({
  v: 1,
  kid: 'k',
  id: 'L-1',
  customer: 'cus_X',
  product: 'servers',
  pack: 'S',
  max_servers: 5,
  kind: 'event',
  issued_at: '2026-10-01T00:00:00Z',
  updates_until: '2026-10-09',
  valid_from: '2026-10-07',
  valid_to: '2026-10-09',
  ...over,
});

describe('buy hint', () => {
  it('names the license in use and the next size up', () => {
    const m = FALLBACK_PACKS.find((p) => p.product === 'servers' && p.size === 'M')!;
    expect(buyHint([lic({})], FALLBACK_PACKS, '2026-10-01')).toBe(`You have Servers S (event, ends 9 Oct). Need more servers? Choose ${m.name}.`);
  });
  it('says nothing without a license in use', () => {
    expect(buyHint([], FALLBACK_PACKS, '2026-10-01')).toBeNull();
    expect(buyHint([lic({})], FALLBACK_PACKS, '2026-10-10')).toBeNull();
  });
  it('asks for a quote above the biggest pack', () => {
    const biggest = Math.max(...FALLBACK_PACKS.filter((p) => p.product === 'platform').map((p) => p.maxServers));
    expect(buyHint([lic({ product: 'platform', pack: 'L', max_servers: biggest, kind: 'founder' })], FALLBACK_PACKS, '2026-10-01')).toBe(
      'You have Platform L (founder). Need more servers? Ask us for a quote.',
    );
  });
});
