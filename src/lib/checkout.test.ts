import { describe, expect, it } from 'vitest';
import {
  clientIp,
  createRateLimiter,
  deriveOption,
  describeLicense,
  licenseMetadata,
  pickPrice,
  unitAmountCents,
  validateCheckoutRequest,
  type PriceLike,
} from './checkout';

const valid = {
  option: 'platform',
  period: 'event',
  seats: 34,
  tools: ['platform', 'matchzy'],
  use: 'commercial',
  community: false,
};

describe('deriveOption', () => {
  it('platform wins over everything', () => {
    expect(deriveOption(['platform'])).toBe('platform');
    expect(deriveOption(['csm', 'readyup', 'platform', 'matchzy'])).toBe('platform');
  });
  it('CS2 Server Manager and/or Ready Up is the servers rate', () => {
    expect(deriveOption(['csm'])).toBe('servers');
    expect(deriveOption(['readyup'])).toBe('servers');
    expect(deriveOption(['csm', 'readyup', 'matchzy'])).toBe('servers');
  });
  it('MatchZy Enhanced alone or nothing needs no paid license', () => {
    expect(deriveOption(['matchzy'])).toBeNull();
    expect(deriveOption([])).toBeNull();
  });
});

describe('validateCheckoutRequest', () => {
  it('accepts a valid request and sorts tools', () => {
    const r = validateCheckoutRequest(valid);
    expect(r).toEqual({ ok: true, value: { ...valid, tools: ['matchzy', 'platform'] } });
  });

  it('accepts the seat bounds', () => {
    expect(validateCheckoutRequest({ ...valid, seats: 1 }).ok).toBe(true);
    expect(validateCheckoutRequest({ ...valid, seats: 500 }).ok).toBe(true);
    expect(validateCheckoutRequest({ ...valid, option: 'servers', period: 'year', tools: ['csm'], community: true }).ok).toBe(true);
  });

  const rejects: [string, unknown][] = [
    ['null', null],
    ['array', [valid]],
    ['string', 'x'],
    ['missing field', { ...valid, community: undefined }],
    ['extra field', { ...valid, price: 1 }],
    ['unknown option', { ...valid, option: 'hosting' }],
    ['option not matching tools', { ...valid, option: 'servers' }],
    ['platform option for servers tools', { ...valid, option: 'platform', tools: ['csm'] }],
    ['period yearly (API takes year)', { ...valid, period: 'yearly' }],
    ['seats 0', { ...valid, seats: 0 }],
    ['seats 501', { ...valid, seats: 501 }],
    ['seats fractional', { ...valid, seats: 2.5 }],
    ['seats as string', { ...valid, seats: '34' }],
    ['seats NaN', { ...valid, seats: Number.NaN }],
    ['tools not an array', { ...valid, tools: 'platform' }],
    ['tools empty', { ...valid, tools: [] }],
    ['unknown tool', { ...valid, tools: ['platform', 'serverManager'] }],
    ['duplicate tool', { ...valid, tools: ['platform', 'platform'] }],
    ['free tools only', { ...valid, option: 'servers', tools: ['matchzy'] }],
    ['personal use', { ...valid, use: 'personal' }],
    ['non-profit use', { ...valid, use: 'nonprofit' }],
    ['community as string', { ...valid, community: 'false' }],
  ];
  it.each(rejects)('rejects %s', (_name, body) => {
    expect(validateCheckoutRequest(body).ok).toBe(false);
  });
});

describe('license text', () => {
  it('describes the order', () => {
    expect(describeLicense({ option: 'platform', period: 'event', seats: 34 })).toBe('Auto Tournament license: platform, per event, 34 seats');
    expect(describeLicense({ option: 'servers', period: 'year', seats: 1 })).toBe('Auto Tournament license: servers, yearly, 1 seat');
  });
  it('builds string metadata', () => {
    const r = validateCheckoutRequest({ ...valid, community: true });
    if (!r.ok) throw new Error(r.error);
    expect(licenseMetadata(r.value)).toEqual({ option: 'platform', period: 'event', seats: '34', tools: 'matchzy,platform', community: 'true' });
  });
});

describe('pickPrice', () => {
  const price = (over: Partial<PriceLike> = {}, product: Partial<Exclude<PriceLike['product'], string>> = {}): PriceLike => ({
    id: 'price_ok',
    active: true,
    currency: 'eur',
    type: 'one_time',
    unit_amount: 500,
    billing_scheme: 'per_unit',
    transform_quantity: null,
    ...over,
    product: { name: 'Platform license: per event', active: true, ...product },
  });

  it('matches the pricing.ts amounts', () => {
    expect(unitAmountCents('servers', 'event')).toBe(300);
    expect(unitAmountCents('servers', 'year')).toBe(1200);
    expect(unitAmountCents('platform', 'event')).toBe(500);
    expect(unitAmountCents('platform', 'year')).toBe(2000);
  });

  it('picks the matching price', () => {
    expect(pickPrice([price()], 'platform', 'event')?.id).toBe('price_ok');
  });

  it.each([
    ['wrong amount', price({ unit_amount: 400 })],
    ['wrong currency', price({ currency: 'nok' })],
    ['recurring', price({ type: 'recurring' })],
    ['inactive price', price({ active: false })],
    ['tiered', price({ billing_scheme: 'tiered' })],
    ['quantity transform', price({ transform_quantity: { divide_by: 2, round: 'up' } })],
    ['other product name', price({}, { name: 'Platform license: yearly' })],
    ['name not exact', price({}, { name: 'platform license: per event' })],
    ['archived product', price({}, { active: false })],
    ['product not expanded', { ...price(), product: 'prod_123' }],
  ])('rejects %s', (_name, p) => {
    expect(pickPrice([p], 'platform', 'event')).toBeNull();
  });

  it("prefers the product's default price", () => {
    const a = price({ id: 'price_a' }, { default_price: 'price_b' });
    const b = price({ id: 'price_b' }, { default_price: 'price_b' });
    expect(pickPrice([a, b], 'platform', 'event')?.id).toBe('price_b');
  });
});

describe('clientIp', () => {
  it('prefers CF-Connecting-IP, then the first X-Forwarded-For hop', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 2.2.2.2 , 3.3.3.3' }))).toBe('2.2.2.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('createRateLimiter', () => {
  it('allows 10 a minute per key', () => {
    const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) expect(allow('a', 1000 + i)).toBe(true);
    expect(allow('a', 2000)).toBe(false);
    expect(allow('b', 2000)).toBe(true);
    expect(allow('a', 62_000)).toBe(true);
  });
});
