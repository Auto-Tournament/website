import { describe, expect, it } from 'vitest';
import { PACKS, packFor, type PackId } from '../components/pricing';
import {
  businessBuyerField,
  checkoutFormParams,
  clientIp,
  createRateLimiter,
  derivePack,
  deriveProduct,
  describeLicense,
  licenseMetadata,
  lineItem,
  lineItemName,
  stripeMaxCustomFields,
  stripeMaxLabelLength,
  unitAmountCents,
  validateCheckoutRequest,
} from './checkout';

const valid = {
  pack: 'platform-l',
  period: 'event',
  servers: 34,
  tools: ['platform', 'matchzy'],
  use: 'commercial',
};

describe('deriveProduct', () => {
  it('platform wins over everything', () => {
    expect(deriveProduct(['platform'])).toBe('platform');
    expect(deriveProduct(['csm', 'readyup', 'platform', 'matchzy'])).toBe('platform');
  });
  it('CS2 Server Manager and/or Ready Up is a Servers pack', () => {
    expect(deriveProduct(['csm'])).toBe('servers');
    expect(deriveProduct(['readyup'])).toBe('servers');
    expect(deriveProduct(['csm', 'readyup', 'matchzy'])).toBe('servers');
  });
  it('MatchZy Enhanced alone or nothing needs no paid license', () => {
    expect(deriveProduct(['matchzy'])).toBeNull();
    expect(deriveProduct([])).toBeNull();
  });
});

describe('derivePack', () => {
  const cases: [number, string | null][] = [
    [1, 's'],
    [5, 's'],
    [6, 'm'],
    [15, 'm'],
    [16, 'l'],
    [40, 'l'],
    [41, null],
  ];
  it.each(cases)('%i servers → size %s', (servers, size) => {
    expect(derivePack(['csm'], servers)?.id ?? null).toBe(size ? `servers-${size}` : null);
    expect(derivePack(['platform', 'readyup'], servers)?.id ?? null).toBe(size ? `platform-${size}` : null);
  });
  it('free tools have no pack', () => {
    expect(derivePack(['matchzy'], 4)).toBeNull();
  });
  it('picks the smallest pack that fits', () => {
    for (const pack of PACKS) {
      expect(packFor(pack.product, pack.maxServers)?.id).toBe(pack.id);
    }
  });
});

describe('validateCheckoutRequest', () => {
  it('accepts a valid request and sorts tools', () => {
    const r = validateCheckoutRequest(valid);
    expect(r).toEqual({ ok: true, value: { ...valid, tools: ['matchzy', 'platform'] } });
  });

  it('accepts every period and the server bounds', () => {
    for (const period of ['event', 'year', 'founder']) {
      expect(validateCheckoutRequest({ ...valid, period }).ok).toBe(true);
    }
    expect(validateCheckoutRequest({ ...valid, pack: 'platform-s', servers: 1 }).ok).toBe(true);
    expect(validateCheckoutRequest({ ...valid, pack: 'platform-l', servers: 40 }).ok).toBe(true);
    expect(validateCheckoutRequest({ ...valid, pack: 'servers-m', period: 'year', servers: 6, tools: ['csm'] }).ok).toBe(true);
    expect(validateCheckoutRequest({ ...valid, pack: 'servers-l', period: 'founder', servers: 34, tools: ['csm'] }).ok).toBe(true);
  });

  const rejects: [string, unknown][] = [
    ['null', null],
    ['array', [valid]],
    ['string', 'x'],
    ['missing field', { ...valid, use: undefined }],
    ['extra field', { ...valid, price: 1 }],
    ['old per-seat body', { option: 'platform', period: 'event', seats: 34, tools: ['platform'], use: 'commercial' }],
    ['unknown pack', { ...valid, pack: 'platform-xl' }],
    ['pack as upper case', { ...valid, pack: 'Platform-L' }],
    ['product not matching tools', { ...valid, pack: 'servers-l' }],
    ['platform pack for servers tools', { ...valid, pack: 'platform-l', tools: ['csm'] }],
    ['pack too small for servers', { ...valid, pack: 'platform-m', servers: 16 }],
    ['pack bigger than needed', { ...valid, pack: 'platform-l', servers: 15 }],
    ['pack S for 6 servers', { ...valid, pack: 'platform-s', servers: 6 }],
    ['period yearly (API takes year)', { ...valid, period: 'yearly' }],
    ['unknown period', { ...valid, period: 'lifetime' }],
    ['servers 0', { ...valid, servers: 0 }],
    ['servers 41', { ...valid, servers: 41 }],
    ['servers negative', { ...valid, servers: -1 }],
    ['servers fractional', { ...valid, servers: 2.5 }],
    ['servers as string', { ...valid, servers: '34' }],
    ['servers NaN', { ...valid, servers: Number.NaN }],
    ['servers Infinity', { ...valid, servers: Number.POSITIVE_INFINITY }],
    ['tools not an array', { ...valid, tools: 'platform' }],
    ['tools empty', { ...valid, tools: [] }],
    ['unknown tool', { ...valid, tools: ['platform', 'serverManager'] }],
    ['duplicate tool', { ...valid, tools: ['platform', 'platform'] }],
    ['free tools only', { ...valid, pack: 'servers-l', tools: ['matchzy'] }],
    ['personal use', { ...valid, use: 'personal' }],
    ['non-profit use', { ...valid, use: 'nonprofit' }],
    ['non-commercial use', { ...valid, use: 'noncommercial' }],
  ];
  it.each(rejects)('rejects %s', (_name, body) => {
    expect(validateCheckoutRequest(body).ok).toBe(false);
  });
});

describe('pack prices', () => {
  const expected: [PackId, number, number, number][] = [
    ['servers-s', 1900, 4900, 7900],
    ['servers-m', 4900, 12900, 19900],
    ['servers-l', 9900, 27900, 39900],
    ['platform-s', 3900, 9900, 14900],
    ['platform-m', 7900, 21900, 32900],
    ['platform-l', 14900, 42900, 59900],
  ];
  it.each(expected)('%s: event %i, year %i, founder %i cents', (pack, event, year, founder) => {
    expect(unitAmountCents(pack, 'event')).toBe(event);
    expect(unitAmountCents(pack, 'year')).toBe(year);
    expect(unitAmountCents(pack, 'founder')).toBe(founder);
  });
  it('covers every pack', () => {
    expect(PACKS.map((p) => p.id).sort()).toEqual(expected.map((e) => e[0]).sort());
  });
});

describe('lineItem', () => {
  it('is an inline EUR price, quantity 1, tax exclusive', () => {
    expect(lineItem({ pack: 'servers-l', period: 'event' })).toEqual({
      price_data: {
        currency: 'eur',
        unit_amount: 9900,
        tax_behavior: 'exclusive',
        product_data: {
          name: 'Servers L license — per event (up to 40 servers)',
          description: expect.stringContaining('No more than 40 game servers'),
        },
      },
      quantity: 1,
    });
  });
  it('names each period', () => {
    expect(lineItemName('platform-s', 'year')).toBe('Platform S license — yearly (up to 5 servers)');
    expect(lineItemName('servers-m', 'founder')).toBe('Servers M license — founding supporter (up to 15 servers)');
    expect(lineItem({ pack: 'servers-l', period: 'founder' }).price_data.unit_amount).toBe(39900);
  });
});

describe('license text', () => {
  it('describes the order', () => {
    expect(describeLicense({ pack: 'platform-l', period: 'event' })).toBe('Auto Tournament Platform L license — per event (up to 40 servers)');
  });
  it('builds string metadata', () => {
    const r = validateCheckoutRequest(valid);
    if (!r.ok) throw new Error(r.error);
    expect(licenseMetadata(r.value)).toEqual({ pack: 'platform-l', period: 'event', servers: '34', tools: 'matchzy,platform' });
  });
  it('marks founder orders', () => {
    const r = validateCheckoutRequest({ ...valid, period: 'founder' });
    if (!r.ok) throw new Error(r.error);
    expect(licenseMetadata(r.value)).toMatchObject({ pack: 'platform-l', period: 'founder', founder: 'true' });
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

describe('checkoutFormParams', () => {
  const params = checkoutFormParams('https://autotournament.gg');

  it('requires accepting the terms, with links to both documents', () => {
    expect(params.consent_collection).toEqual({ terms_of_service: 'required' });
    const message = params.custom_text.terms_of_service_acceptance.message;
    expect(message).toContain('(https://autotournament.gg/terms)');
    expect(message).toContain('(https://autotournament.gg/terms-of-sale)');
  });

  it('requires the business name and a billing address, and keeps tax ID collection', () => {
    expect(params.name_collection).toEqual({ business: { enabled: true, optional: false } });
    expect(params.billing_address_collection).toBe('required');
    expect(params.tax_id_collection).toEqual({ enabled: true });
  });

  it('requires the B2B confirmation as a one-option dropdown', () => {
    const field = params.custom_fields.find((f) => f.key === businessBuyerField.key);
    expect(field).toBeDefined();
    expect(field?.type).toBe('dropdown');
    expect(field?.optional).toBe(false);
    expect(field?.label.custom).toBe("I'm buying for a business, not as a consumer");
    expect(field && 'dropdown' in field ? field.dropdown?.options : []).toEqual([
      { label: businessBuyerField.optionLabel, value: businessBuyerField.optionValue },
    ]);
  });

  it('requires the event dates and the event or client name', () => {
    const byKey = Object.fromEntries(params.custom_fields.map((f) => [f.key, f]));
    expect(byKey.eventdates?.optional).toBe(false);
    expect(byKey.eventname?.optional).toBe(false);
    expect(byKey.eventname?.label.custom).toMatch(/client/);
  });

  it('stays within Stripe limits: 3 fields, 50-character labels, alphanumeric unique keys', () => {
    const { custom_fields } = params;
    expect(custom_fields.length).toBeLessThanOrEqual(stripeMaxCustomFields);
    for (const f of custom_fields) {
      expect(f.label.custom.length).toBeLessThanOrEqual(stripeMaxLabelLength);
      expect(f.key).toMatch(/^[a-z0-9]+$/i);
    }
    expect(new Set(custom_fields.map((f) => f.key)).size).toBe(custom_fields.length);
  });
});
