import { describe, expect, it } from 'vitest';
import { FALLBACK_PACKS, periods, type PackId, type Period } from '../components/pricing';
import { allLookupKeys, chunkLookupKeys, lookupKey, packsFromStripePrices, type StripePriceLike } from './stripePacks';

type Product = { id: string; active: boolean; metadata: Record<string, string> };

function product(pack: PackId, maxServers: string | number = FALLBACK_PACKS.find((p) => p.id === pack)!.maxServers): Product {
  return { id: `prod_${pack}`, active: true, metadata: { pack_id: pack, max_servers: String(maxServers) } };
}

function price(pack: PackId, period: Period, overrides: Partial<StripePriceLike> = {}): StripePriceLike {
  return {
    id: `price_${pack}_${period}`,
    active: true,
    billing_scheme: 'per_unit',
    currency: 'eur',
    custom_unit_amount: null,
    lookup_key: lookupKey(pack, period),
    recurring: null,
    tax_behavior: 'exclusive',
    transform_quantity: null,
    type: 'one_time',
    unit_amount: FALLBACK_PACKS.find((p) => p.id === pack)!.prices[period],
    product: product(pack),
    ...overrides,
  };
}

/** The 18 prices the seed script creates, as prices.list returns them. */
function stripeList(): StripePriceLike[] {
  return FALLBACK_PACKS.flatMap((p) => periods.map((period) => price(p.id, period)));
}

function replace(list: StripePriceLike[], pack: PackId, period: Period, overrides: Partial<StripePriceLike>) {
  return list.map((p) => (p.lookup_key === lookupKey(pack, period) ? { ...p, ...overrides } : p));
}

function errorsOf(list: StripePriceLike[]): string[] {
  const r = packsFromStripePrices(list);
  if (r.ok) throw new Error('expected the price list to be rejected');
  return r.errors;
}

describe('lookup keys', () => {
  it('are <pack_id>_<period> with underscores', () => {
    expect(lookupKey('servers-l', 'event')).toBe('servers_l_event');
    expect(lookupKey('platform-s', 'founder')).toBe('platform_s_founder');
  });
  it('cover 18 prices, fetched in chunks of at most 10', () => {
    expect(allLookupKeys).toHaveLength(18);
    expect(new Set(allLookupKeys).size).toBe(18);
    const chunks = chunkLookupKeys();
    expect(chunks.every((c) => c.length <= 10)).toBe(true);
    expect(chunks.flat()).toEqual(allLookupKeys);
  });
});

describe('packsFromStripePrices', () => {
  it('maps a valid list into the pack shape, with price ids by lookup key', () => {
    const r = packsFromStripePrices(stripeList());
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.value.packs).toEqual(FALLBACK_PACKS);
    expect(Object.keys(r.value.priceIds).sort()).toEqual([...allLookupKeys].sort());
    expect(r.value.priceIds.servers_l_event).toBe('price_servers-l_event');
  });

  it('takes the amounts and server limits from Stripe, in any order', () => {
    let list = replace(stripeList(), 'servers-l', 'event', { unit_amount: 10900 });
    list = list.map((p) =>
      (p.product as Product).id === 'prod_servers-l' ? { ...p, product: product('servers-l', 50) } : p,
    );
    const r = packsFromStripePrices([...list].reverse());
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const l = r.value.packs.find((p) => p.id === 'servers-l')!;
    expect(l.prices.event).toBe(10900);
    expect(l.maxServers).toBe(50);
    expect(r.value.packs.map((p) => p.id)).toEqual(FALLBACK_PACKS.map((p) => p.id));
  });

  it('ignores prices with other lookup keys', () => {
    const r = packsFromStripePrices([...stripeList(), price('servers-s', 'event', { id: 'price_other', lookup_key: 'something_else' })]);
    expect(r.ok).toBe(true);
  });

  it('rejects a missing lookup key', () => {
    const list = stripeList().filter((p) => p.lookup_key !== 'platform_m_year');
    expect(errorsOf(list)).toEqual([expect.stringContaining('platform_m_year: missing')]);
  });

  it('rejects an empty list', () => {
    expect(errorsOf([])).toHaveLength(18);
  });

  it('rejects the wrong currency', () => {
    expect(errorsOf(replace(stripeList(), 'servers-s', 'event', { currency: 'usd' }))).toEqual([expect.stringContaining('currency usd')]);
  });

  it('rejects recurring, inactive, tiered, pay-what-you-want and inclusive-tax prices', () => {
    const bad: Partial<StripePriceLike>[] = [
      { type: 'recurring', recurring: { interval: 'year' } as StripePriceLike['recurring'] },
      { active: false },
      { billing_scheme: 'tiered', unit_amount: null },
      { custom_unit_amount: { maximum: null, minimum: null, preset: null } },
      { transform_quantity: { divide_by: 2, round: 'up' } },
      { tax_behavior: 'inclusive' },
      { unit_amount: 0 },
      { unit_amount: null },
    ];
    for (const overrides of bad) {
      expect(packsFromStripePrices(replace(stripeList(), 'platform-l', 'founder', overrides)).ok).toBe(false);
    }
  });

  it('rejects bad product metadata', () => {
    const withProduct = (pack: PackId, p: unknown) =>
      stripeList().map((x) => ((x.product as Product).id === `prod_${pack}` ? { ...x, product: p as Product } : x));
    const cases: unknown[] = [
      product('servers-m', 'abc'),
      product('servers-m', ''),
      product('servers-m', '0'),
      product('servers-m', '-5'),
      product('servers-m', '7.5'),
      product('servers-m', '99999'),
      { ...product('servers-m'), metadata: { pack_id: 'servers-m' } },
      { ...product('servers-m'), metadata: { pack_id: 'servers-l', max_servers: '15' } },
      { ...product('servers-m'), active: false },
      { id: 'prod_servers-m', object: 'product', deleted: true },
      'prod_servers-m',
    ];
    for (const p of cases) {
      expect(packsFromStripePrices(withProduct('servers-m', p)).ok, JSON.stringify(p)).toBe(false);
    }
  });

  it('rejects a pack whose prices sit on different products', () => {
    const list = replace(stripeList(), 'servers-m', 'year', { product: { ...product('servers-m'), id: 'prod_other' } });
    expect(errorsOf(list)).toEqual([expect.stringContaining('differs from the other servers-m prices')]);
  });

  it('rejects server limits that are not increasing S < M < L', () => {
    const list = stripeList().map((p) =>
      (p.product as Product).id === 'prod_platform-m' ? { ...p, product: product('platform-m', 40) } : p,
    );
    expect(errorsOf(list)).toEqual([expect.stringContaining('platform-l: max_servers 40 is not above platform-m (40)')]);
  });

  it('rejects duplicate lookup keys', () => {
    const list = [...stripeList(), price('servers-s', 'event', { id: 'price_dup' })];
    expect(errorsOf(list)).toEqual([expect.stringContaining('servers_s_event: more than one price')]);
  });
});
