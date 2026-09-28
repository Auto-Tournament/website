import { describe, expect, it } from 'vitest';
import { FALLBACK_PACKS, packFor, type Pack } from '../components/pricing';
import {
  businessBuyerField,
  checkoutFormParams,
  checkoutPeriods,
  checkoutSessionParams,
  checkoutDetailsMetadata,
  protectedMetadataKeys,
  sessionTakesDetails,
  stripeTaxId,
  validateCheckoutDetails,
  invoiceFooter,
  clientIp,
  createRateLimiter,
  derivePack,
  deriveProduct,
  describeLicense,
  licenseMetadata,
  lineItemName,
  stripeMaxCustomFields,
  stripeMaxLabelLength,
  validateCheckoutRequest,
  type CheckoutTool,
} from './checkout';

const packs = FALLBACK_PACKS;

/** Packs with other server limits, as Stripe metadata could set them: S 3, M 10, L 25. */
const custom: Pack[] = FALLBACK_PACKS.map((p) => ({ ...p, maxServers: { S: 3, M: 10, L: 25 }[p.size] }));

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
    [6, 's'],
    [7, 'm'],
    [20, 'm'],
    [21, 'l'],
    [40, 'l'],
    [41, null],
  ];
  it.each(cases)('%i servers → size %s', (servers, size) => {
    expect(derivePack(packs, ['csm'], servers)?.id ?? null).toBe(size ? `servers-${size}` : null);
    expect(derivePack(packs, ['platform', 'readyup'], servers)?.id ?? null).toBe(size ? `platform-${size}` : null);
  });
  it('free tools have no pack', () => {
    expect(derivePack(packs, ['matchzy'], 4)).toBeNull();
  });
  it('picks the smallest pack that fits', () => {
    for (const pack of packs) {
      expect(packFor(packs, pack.product, pack.maxServers)?.id).toBe(pack.id);
    }
  });

  const customCases: [number, string | null][] = [
    [3, 's'],
    [4, 'm'],
    [10, 'm'],
    [11, 'l'],
    [25, 'l'],
    [26, null],
  ];
  it.each(customCases)('custom limits (S 3, M 10, L 25): %i servers → size %s', (servers, size) => {
    expect(derivePack(custom, ['readyup'], servers)?.id ?? null).toBe(size ? `servers-${size}` : null);
    expect(derivePack(custom, ['platform'], servers)?.id ?? null).toBe(size ? `platform-${size}` : null);
  });
  it('does not depend on the order of the packs', () => {
    const reversed = [...custom].reverse();
    expect(derivePack(reversed, ['csm'], 2)?.id).toBe('servers-s');
    expect(derivePack(reversed, ['csm'], 9)?.id).toBe('servers-m');
  });
});

describe('validateCheckoutRequest', () => {
  it('accepts a valid request and sorts tools', () => {
    const r = validateCheckoutRequest(valid, packs);
    expect(r).toEqual({ ok: true, value: { ...valid, tools: ['matchzy', 'platform'] } });
  });

  it('accepts every period and the server bounds', () => {
    for (const period of ['event', 'year', 'founder']) {
      expect(validateCheckoutRequest({ ...valid, period }, packs).ok).toBe(true);
    }
    expect(validateCheckoutRequest({ ...valid, pack: 'platform-s', servers: 1 }, packs).ok).toBe(true);
    expect(validateCheckoutRequest({ ...valid, pack: 'platform-l', servers: 40 }, packs).ok).toBe(true);
    expect(validateCheckoutRequest({ ...valid, pack: 'servers-m', period: 'year', servers: 7, tools: ['csm'] }, packs).ok).toBe(true);
    expect(validateCheckoutRequest({ ...valid, pack: 'servers-l', period: 'founder', servers: 34, tools: ['csm'] }, packs).ok).toBe(true);
  });

  it('accepts a direct buy (servers = the pack maxServers) for every pack and period, as the cards and founder strip send it', () => {
    for (const pack of packs) {
      const tools: CheckoutTool[] = pack.product === 'platform' ? ['platform'] : ['csm'];
      for (const period of checkoutPeriods) {
        const r = validateCheckoutRequest({ pack: pack.id, period, servers: pack.maxServers, tools, use: 'commercial' }, packs);
        expect(r).toEqual({ ok: true, value: { pack: pack.id, period, servers: pack.maxServers, tools, use: 'commercial' } });
      }
    }
  });

  it("uses the server's pack limits, not the fallback ones", () => {
    // 4 servers is S in the fallback, M with S capped at 3.
    expect(validateCheckoutRequest({ ...valid, pack: 'platform-s', servers: 4 }, custom).ok).toBe(false);
    expect(validateCheckoutRequest({ ...valid, pack: 'platform-m', servers: 4 }, custom).ok).toBe(true);
    // The biggest pack's limit is the cap: 26 is a custom quote with L at 25.
    expect(validateCheckoutRequest({ ...valid, pack: 'platform-l', servers: 25 }, custom).ok).toBe(true);
    const over = validateCheckoutRequest({ ...valid, pack: 'platform-l', servers: 26 }, custom);
    expect(over).toEqual({ ok: false, error: 'More than 25 servers is a custom quote. Email us instead.' });
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
    ['pack too small for servers', { ...valid, pack: 'platform-m', servers: 21 }],
    ['pack bigger than needed', { ...valid, pack: 'platform-l', servers: 15 }],
    ['pack S for 7 servers', { ...valid, pack: 'platform-s', servers: 7 }],
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
    expect(validateCheckoutRequest(body, packs).ok).toBe(false);
  });
});

describe('fallback packs', () => {
  const expected: [string, number, number, number, number][] = [
    ['servers-s', 6, 1900, 4900, 19900],
    ['servers-m', 20, 5900, 14900, 59900],
    ['servers-l', 40, 9900, 27900, 109900],
    ['platform-s', 6, 3900, 9900, 39900],
    ['platform-m', 20, 9900, 24900, 99900],
    ['platform-l', 40, 15900, 42900, 169900],
  ];
  it('match the Pricing v3 table (and the seed script)', () => {
    expect(FALLBACK_PACKS.map((p) => [p.id, p.maxServers, p.prices.event, p.prices.year, p.prices.founder])).toEqual(expected);
  });
});

describe('license text', () => {
  const pack = (id: string) => packs.find((p) => p.id === id) as Pack;
  it('names each period with the pack limit', () => {
    expect(lineItemName(pack('platform-s'), 'year')).toBe('Platform S license — yearly (up to 6 servers)');
    expect(lineItemName(pack('servers-m'), 'founder')).toBe('Servers M license — founding supporter (up to 20 servers)');
    expect(lineItemName({ ...pack('servers-l'), maxServers: 25 }, 'event')).toBe('Servers L license — per event (up to 25 servers)');
  });
  it('describes the order', () => {
    expect(describeLicense(pack('platform-l'), 'event')).toBe('Auto Tournament Platform L license — per event (up to 40 servers)');
  });
  it('builds string metadata', () => {
    const r = validateCheckoutRequest(valid, packs);
    if (!r.ok) throw new Error(r.error);
    expect(licenseMetadata(r.value)).toEqual({ pack: 'platform-l', period: 'event', servers: '34', tools: 'matchzy,platform' });
  });
  it('marks founder orders', () => {
    const r = validateCheckoutRequest({ ...valid, period: 'founder' }, packs);
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

describe('checkoutSessionParams', () => {
  const base = 'https://autotournament.gg';
  const args = { base, priceId: 'price_1', description: 'Auto Tournament x', metadata: { pack: 'servers-m' }, buyer: { customer_creation: 'always' as const } };

  it('custom: ui_mode elements and one return_url to the thanks page, no success/cancel URL', () => {
    const p = checkoutSessionParams({ ...args, mode: 'custom' });
    expect(p).toMatchObject({ ui_mode: 'elements', return_url: `${base}/pricing/thanks?session_id={CHECKOUT_SESSION_ID}` });
    expect(p).not.toHaveProperty('success_url');
    expect(p).not.toHaveProperty('cancel_url');
  });

  it('custom: no Stripe-UI-only fields (custom_fields, custom_text, consent, name_collection); our form collects those', () => {
    const p = checkoutSessionParams({ ...args, mode: 'custom' });
    for (const key of ['custom_fields', 'custom_text', 'consent_collection', 'name_collection']) expect(p).not.toHaveProperty(key);
    expect(p).toMatchObject({ billing_address_collection: 'required', tax_id_collection: { enabled: true } });
  });

  it('hosted: success and cancel URLs and all of Stripe\'s form fields, as before', () => {
    const p = checkoutSessionParams({ ...args, mode: 'hosted' });
    expect(p).toMatchObject({ success_url: `${base}/pricing/thanks?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${base}/pricing#guide`, ...checkoutFormParams(base) });
    expect(p).not.toHaveProperty('ui_mode');
    expect(p).not.toHaveProperty('return_url');
  });

  it('keeps every business rule the same in both modes: price, customer, metadata, invoice and footer, promo codes', () => {
    const rules = {
      mode: 'payment',
      line_items: [{ price: 'price_1', quantity: 1 }],
      customer_creation: 'always',
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      metadata: { pack: 'servers-m' },
      payment_intent_data: { description: 'Auto Tournament x', metadata: { pack: 'servers-m' } },
      invoice_creation: { enabled: true, invoice_data: { description: 'Auto Tournament x', metadata: { pack: 'servers-m' }, footer: invoiceFooter } },
      allow_promotion_codes: true,
    };
    expect(checkoutSessionParams({ ...args, mode: 'custom' })).toMatchObject(rules);
    expect(checkoutSessionParams({ ...args, mode: 'hosted' })).toMatchObject(rules);
  });

  it('uses the console customer when there is one', () => {
    const p = checkoutSessionParams({ ...args, buyer: { customer: 'cus_1', customer_update: { name: 'auto', address: 'auto' } }, mode: 'custom' });
    expect(p).toMatchObject({ customer: 'cus_1', customer_update: { name: 'auto', address: 'auto' } });
    expect(p).not.toHaveProperty('customer_creation');
  });
});

describe('validateCheckoutDetails (our custom form)', () => {
  const good = {
    sessionId: 'cs_test_a1b2c3d4e5f6g7h8',
    company: '  Example   LAN AS ',
    eventName: 'Example LAN, example.no',
    eventDates: '3-5 October 2026',
    vatId: 'no 123456789 mva',
    business: true,
    terms: true,
  };

  it('accepts a full form, trimming and collapsing spaces, upper-casing the VAT ID', () => {
    expect(validateCheckoutDetails(good)).toEqual({
      ok: true,
      value: { ...good, company: 'Example LAN AS', vatId: 'NO 123456789 MVA' },
    });
    expect(validateCheckoutDetails({ ...good, vatId: '' })).toMatchObject({ ok: true, value: { vatId: '' } });
  });

  it('names the field that is wrong', () => {
    const field = (over: Record<string, unknown>) => {
      const r = validateCheckoutDetails({ ...good, ...over });
      return r.ok ? null : r.field;
    };
    expect(field({ company: ' ' })).toBe('company');
    expect(field({ company: 'x'.repeat(121) })).toBe('company');
    expect(field({ eventName: '' })).toBe('eventName');
    expect(field({ eventDates: 'no' })).toBe('eventDates');
    expect(field({ vatId: 'NO<script>' })).toBe('vatId');
    expect(field({ business: false })).toBe('business');
    expect(field({ terms: 'yes' })).toBe('terms');
    expect(field({ sessionId: 'pi_123' })).toBe('sessionId');
    expect(field({ company: 'Evil\u0000Co' })).toBe('company');
  });

  it('rejects extra or missing keys', () => {
    expect(validateCheckoutDetails({ ...good, pack: 'platform-xl' }).ok).toBe(false);
    const { terms: _t, ...missing } = good;
    expect(validateCheckoutDetails(missing).ok).toBe(false);
    expect(validateCheckoutDetails(null).ok).toBe(false);
  });
});

describe('checkoutDetailsMetadata', () => {
  const details = {
    sessionId: 'cs_test_a1b2c3d4e5f6g7h8',
    company: 'Example LAN AS',
    eventName: 'Example LAN',
    eventDates: '3-5 October 2026',
    vatId: 'NO123456789MVA',
    business: true as const,
    terms: true as const,
  };
  const at = new Date('2026-09-29T12:00:00.000Z');

  it('writes the hosted custom-field keys, the VAT ID and the server time of acceptance', () => {
    expect(checkoutDetailsMetadata(details, at)).toEqual({
      company: 'Example LAN AS',
      eventname: 'Example LAN',
      eventdates: '3-5 October 2026',
      buyertype: 'business',
      vat_id: 'NO123456789MVA',
      terms_accepted_at: '2026-09-29T12:00:00.000Z',
    });
    expect(checkoutDetailsMetadata({ ...details, vatId: '' }, at)).not.toHaveProperty('vat_id');
  });

  it('never writes the keys set at session creation (pack, period, max_servers, founder…)', () => {
    const keys = Object.keys(checkoutDetailsMetadata(details, at));
    for (const k of protectedMetadataKeys) expect(keys).not.toContain(k);
  });

  it('stays within Stripe metadata limits (40-char keys, 500-char values)', () => {
    const long = { ...details, company: 'c'.repeat(120), eventName: 'e'.repeat(200), eventDates: 'd'.repeat(100), vatId: 'V'.repeat(40) };
    for (const [k, v] of Object.entries(checkoutDetailsMetadata(long, at))) {
      expect(k.length).toBeLessThanOrEqual(40);
      expect(v.length).toBeLessThanOrEqual(500);
    }
  });
});

describe('sessionTakesDetails', () => {
  const s = { status: 'open', ui_mode: 'elements', metadata: { pack: 'platform-m' } };
  it('only an open custom-mode session from /api/checkout', () => {
    expect(sessionTakesDetails(s)).toBe(true);
    expect(sessionTakesDetails({ ...s, status: 'complete' })).toBe(false);
    expect(sessionTakesDetails({ ...s, status: 'expired' })).toBe(false);
    expect(sessionTakesDetails({ ...s, ui_mode: 'hosted_page' })).toBe(false);
    expect(sessionTakesDetails({ ...s, metadata: {} })).toBe(false);
    expect(sessionTakesDetails({ ...s, metadata: null })).toBe(false);
  });
});

describe('stripeTaxId', () => {
  it('maps the VAT number to Stripe\'s type by billing country', () => {
    expect(stripeTaxId('NO', '123 456 789')).toEqual({ type: 'no_vat', value: '123456789MVA' });
    expect(stripeTaxId('NO', 'NO123456789MVA')).toEqual({ type: 'no_vat', value: '123456789MVA' });
    expect(stripeTaxId('DE', '123456789')).toEqual({ type: 'eu_vat', value: 'DE123456789' });
    expect(stripeTaxId('GR', '123456789')).toEqual({ type: 'eu_vat', value: 'EL123456789' });
    expect(stripeTaxId('SE', 'SE123456789101')).toEqual({ type: 'eu_vat', value: 'SE123456789101' });
    expect(stripeTaxId('GB', '123456789')).toEqual({ type: 'gb_vat', value: 'GB123456789' });
    expect(stripeTaxId('US', '12-3456789')).toBeNull();
    expect(stripeTaxId('DE', '')).toBeNull();
  });
});
