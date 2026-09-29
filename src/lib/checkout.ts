/**
 * Pure checkout logic shared by the pricing guide (client) and /api/checkout
 * (server): tools → product, servers → pack, request validation, the license
 * text, and the small abuse limits. The packs (prices and server limits) are
 * passed in: they come from Stripe (src/lib/stripePrices.ts). No Stripe import
 * and no process.env here, so it runs anywhere and is easy to test.
 *
 * Relative import on purpose: vitest runs this file without the `@/` alias.
 */
import {
  maxPackServers,
  packFor,
  packIds,
  type Pack,
  type PackId,
  type PackProduct,
  type Period,
  type ToolOption,
} from '../components/pricing';

export const checkoutTools = ['matchzy', 'csm', 'readyup', 'platform'] as const;
export type CheckoutTool = (typeof checkoutTools)[number];

export const checkoutPeriods = ['event', 'year', 'founder'] as const satisfies readonly Period[];
export type CheckoutPeriod = Period;

export const minServers = 1;
export const maxBodyBytes = 2048;

/** Price-page tool ids → the ids the checkout API takes. */
export const checkoutToolFor: Record<ToolOption, CheckoutTool> = {
  matchzy: 'matchzy',
  serverManager: 'csm',
  readyUp: 'readyup',
  platform: 'platform',
};

/**
 * Which paid product the ticked tools need. The platform includes CS2 Server
 * Manager and Ready Up, so it wins; either of those alone is a Servers pack;
 * MatchZy Enhanced on its own (or nothing) is free, so there is no product.
 */
export function deriveProduct(tools: Iterable<CheckoutTool>): PackProduct | null {
  const set = new Set(tools);
  if (set.has('platform')) return 'platform';
  if (set.has('csm') || set.has('readyup')) return 'servers';
  return null;
}

/** The smallest of `packs` for these tools and servers; null when free or above the biggest pack. */
export function derivePack(packs: readonly Pack[], tools: Iterable<CheckoutTool>, servers: number): Pack | null {
  const product = deriveProduct(tools);
  return product ? packFor(packs, product, servers) : null;
}

export type CheckoutRequest = {
  pack: PackId;
  period: CheckoutPeriod;
  servers: number;
  tools: CheckoutTool[];
  use: 'commercial';
};

export type Validation = { ok: true; value: CheckoutRequest } | { ok: false; error: string };

const requestKeys = ['pack', 'period', 'servers', 'tools', 'use'] as const;

const includes = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

/**
 * Strict: every key present, no extra keys, exact types and values. The server
 * derives the product from the tools and the pack size from the servers, and
 * the pack the client sends must equal that. The price never comes from the
 * client. `packs` are the server's packs (from Stripe), so the server limits
 * that pick the pack are Stripe's too.
 */
export function validateCheckoutRequest(body: unknown, packs: readonly Pack[]): Validation {
  const maxServers = maxPackServers(packs);
  const fail = (error: string): Validation => ({ ok: false, error });

  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('Expected a JSON object.');
  const obj = body as Record<string, unknown>;

  const keys = Object.keys(obj);
  if (keys.length !== requestKeys.length || !requestKeys.every((k) => Object.prototype.hasOwnProperty.call(obj, k))) {
    return fail('Unexpected or missing fields.');
  }

  const { pack, period, servers, tools, use } = obj;

  if (!includes(packIds, pack)) return fail('Invalid pack.');
  if (!includes(checkoutPeriods, period)) return fail('Invalid period.');
  if (typeof servers !== 'number' || !Number.isInteger(servers) || servers < minServers) {
    return fail(`Servers must be a whole number from ${minServers} to ${maxServers}.`);
  }
  if (servers > maxServers) return fail(`More than ${maxServers} servers is a custom quote. Email us instead.`);
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > checkoutTools.length) return fail('Invalid tools.');
  if (!tools.every((t) => includes(checkoutTools, t))) return fail('Invalid tools.');
  if (new Set(tools).size !== tools.length) return fail('Invalid tools.');
  if (use !== 'commercial') return fail('Only commercial use is paid; non-commercial use and non-profit organizations are free.');

  const typedTools = tools as CheckoutTool[];
  if (deriveProduct(typedTools) === null) return fail('These tools need no paid license.');
  const derived = derivePack(packs, typedTools, servers);
  if (derived === null) return fail('Invalid servers.');
  if (derived.id !== pack) return fail('Pack does not match the tools and servers.');

  // Canonical order, so metadata reads the same whatever order the client sent.
  const sorted = checkoutTools.filter((t) => typedTools.includes(t));
  return { ok: true, value: { pack: derived.id, period, servers, tools: sorted, use } };
}

const periodInName: Record<CheckoutPeriod, string> = {
  event: 'per event',
  year: 'yearly',
  founder: 'founding supporter',
};

/** "Servers L license — per event (up to 40 servers)". */
export function lineItemName(pack: Pack, period: CheckoutPeriod): string {
  return `${pack.name} license — ${periodInName[period]} (up to ${pack.maxServers} servers)`;
}

/** Description on the payment and the invoice. */
export function describeLicense(pack: Pack, period: CheckoutPeriod): string {
  return `Auto Tournament ${lineItemName(pack, period)}`;
}

/**
 * Founder packs are limited to the first 25 buyers or until 31 March 2027. The
 * limit is not enforced here: the owner counts founder orders (metadata
 * founder=true) by hand before sending the license and refunds any past it.
 */
export function licenseMetadata(req: CheckoutRequest): Record<string, string> {
  return {
    pack: req.pack,
    period: req.period,
    servers: String(req.servers),
    tools: req.tools.join(','),
    ...(req.period === 'founder' ? { founder: 'true' } : {}),
  };
}

/** Stripe Checkout allows at most 3 custom fields, each label at most 50 characters. */
export const stripeMaxCustomFields = 3;
export const stripeMaxLabelLength = 50;

/**
 * The B2B confirmation. Stripe has no checkbox custom field, so it is a
 * required dropdown with one option: the buyer can't pay without choosing it.
 */
export const businessBuyerField = {
  key: 'buyertype',
  label: "I'm buying for a business, not as a consumer",
  optionLabel: 'Yes, for a business or organization',
  optionValue: 'business',
} as const;

/**
 * Which Checkout the session is for:
 * - `custom`: our own form on our page (ui_mode `elements`, Stripe's Payment
 *   Element inside it). The default once STRIPE_PUBLISHABLE_KEY is set.
 * - `hosted`: checkout.stripe.com, the fallback while it isn't, or when the
 *   custom form could not start in the browser.
 */
export type CheckoutMode = 'custom' | 'hosted';

/**
 * The parts of the Checkout Session that set up the form: who the buyer is,
 * the event, and acceptance of the terms. Structural types only (no Stripe
 * import); the route passes the result straight to Stripe.
 *
 * Hosted: Stripe's page collects all of it.
 * - The business name is Stripe's own field, made required. It isn't a custom
 *   "Company name" field too, because custom fields are capped at 3.
 * - Terms acceptance needs the Terms of service URL set in the Stripe
 *   Dashboard (Settings → Public details), or session creation fails.
 *
 * Custom (ui_mode `elements`): Stripe refuses custom_fields and custom_text
 * there, and its Terms and business-name UI is in private beta, so our form
 * collects them (src/components/checkout/CheckoutForm.tsx) and
 * /api/checkout/details writes them to the session metadata under the same
 * keys as the hosted custom fields (see checkoutDetailsMetadata). The billing
 * address (with the company as its name) and the email go in with
 * checkout.confirm(), the VAT ID with checkout.updateTaxIdInfo(), which
 * tax_id_collection allows in elements mode.
 */
export function checkoutFormParams(base: string) {
  return {
    billing_address_collection: 'required' as const,
    tax_id_collection: { enabled: true },
    name_collection: { business: { enabled: true, optional: false } },
    consent_collection: { terms_of_service: 'required' as const },
    custom_text: {
      terms_of_service_acceptance: {
        message: `I accept the [Commercial License Terms](${base}/terms) and the [Terms of Sale](${base}/terms-of-sale).`,
      },
    },
    custom_fields: [
      {
        key: businessBuyerField.key,
        label: { type: 'custom' as const, custom: businessBuyerField.label },
        type: 'dropdown' as const,
        dropdown: { options: [{ label: businessBuyerField.optionLabel, value: businessBuyerField.optionValue }] },
        optional: false,
      },
      {
        // Stripe keys must be alphanumeric, so no underscores.
        key: 'eventdates',
        label: { type: 'custom' as const, custom: 'Event date(s), or start date if yearly or founder' },
        type: 'text' as const,
        optional: false,
      },
      {
        // Optional: the license is for the buyer's own business. We may ask
        // which events it was used for if we have a reason to check.
        key: 'eventname',
        label: { type: 'custom' as const, custom: 'Event or client name, and website (optional)' },
        type: 'text' as const,
        optional: true,
      },
    ],
  };
}

/** The custom-mode part of checkoutFormParams: what Stripe still collects itself there. */
export function customFormParams() {
  return {
    billing_address_collection: 'required' as const,
    tax_id_collection: { enabled: true },
  };
}

/** Seller details a Norwegian invoice needs (org number), and why no VAT is shown. */
export const invoiceFooter =
  'Gullberg Hansen Consulting (ENK) · Org. nr. 938 566 674 · Fredengvegen 15, 2817 Gjøvik, Norway · sivert@autotournament.gg\n' +
  'No VAT added (seller not VAT-registered). Licenses are governed by the Commercial License Terms at https://autotournament.gg/terms';

/**
 * Where Stripe sends the buyer. The custom form (on our own page) has one
 * return_url, which Stripe.js opens after paying (and after 3-D Secure);
 * there is no cancel URL, since the buyer never left. Hosted Checkout has a
 * success and a cancel URL. Both end on the same thanks page with the
 * session id.
 */
export function checkoutReturnParams(base: string, mode: CheckoutMode) {
  const thanks = `${base}/pricing/thanks?session_id={CHECKOUT_SESSION_ID}`;
  return mode === 'custom'
    ? { ui_mode: 'elements' as const, return_url: thanks }
    : { success_url: thanks, cancel_url: `${base}/pricing#guide` };
}

/** The customer fields from checkoutCustomerParams (src/lib/console/prefill.ts). */
export type CheckoutBuyer = {
  customer?: string;
  customer_email?: string;
  customer_creation?: 'always';
  customer_update?: { name: 'auto'; address: 'auto' };
};

/**
 * Every Checkout Session field, in one place so the custom and the hosted
 * session differ only in checkoutReturnParams and in who collects the form
 * (checkoutFormParams). Structural types only; the route passes the result
 * straight to Stripe.
 */
export function checkoutSessionParams({
  base,
  priceId,
  description,
  metadata,
  buyer,
  mode,
}: {
  base: string;
  priceId: string;
  description: string;
  metadata: Record<string, string>;
  buyer: CheckoutBuyer;
  mode: CheckoutMode;
}) {
  return {
    mode: 'payment' as const,
    // The Stripe price found by its lookup key (<pack>_<period>). The amount
    // is Stripe's and never comes from the client.
    line_items: [{ price: priceId, quantity: 1 }],
    ...(buyer.customer ? { customer: buyer.customer, customer_update: buyer.customer_update } : { customer_creation: buyer.customer_creation }),
    ...(buyer.customer_email ? { customer_email: buyer.customer_email } : {}),
    // Business name, B2B confirmation, event details and the terms checkbox
    // (hosted: Stripe's fields; custom: ours, see checkoutFormParams).
    ...(mode === 'custom' ? customFormParams() : checkoutFormParams(base)),
    metadata,
    payment_intent_data: { description, metadata },
    invoice_creation: { enabled: true, invoice_data: { description, metadata, footer: invoiceFooter } },
    allow_promotion_codes: true,
    ...checkoutReturnParams(base, mode),
  };
}

/* ------------------------------------------------ custom form: our fields */

/** Limits for the fields our custom form sends to /api/checkout/details. */
export const detailLimits = {
  buyerName: { min: 2, max: 100 },
  company: { min: 2, max: 120 },
  eventName: { min: 2, max: 200 },
  eventDates: { min: 4, max: 100 },
  vatId: { max: 40 },
} as const;

/** What our form collects that Stripe's elements mode can't: see checkoutFormParams. */
export type CheckoutDetails = {
  sessionId: string;
  /**
   * The person buying, so we always know who bought (not just the company).
   * Kept in session metadata and on the license row only; never in the
   * license key payload, /verify, or an email to anyone but us.
   */
  buyerName: string;
  company: string;
  eventName: string;
  eventDates: string;
  /** Empty when not given. */
  vatId: string;
  business: true;
  terms: true;
};

export type DetailsValidation = { ok: true; value: CheckoutDetails } | { ok: false; error: string; field?: keyof CheckoutDetails };

const detailKeys = ['sessionId', 'buyerName', 'company', 'eventName', 'eventDates', 'vatId', 'business', 'terms'] as const;

/** cs_test_… / cs_live_…; the same shape the thanks page accepts. */
const sessionIdPattern = /^cs_(?:live|test)_[A-Za-z0-9]{10,250}$/;
// eslint-disable-next-line no-control-regex
const controlChars = /[\u0000-\u001f\u007f]/;
const vatPattern = /^[A-Za-z0-9 .\-]*$/;

/**
 * Strict, like validateCheckoutRequest: every key present, no extra keys,
 * trimmed text within limits, no control characters, and both boxes ticked.
 * Used by the form (inline errors) and by /api/checkout/details.
 */
export function validateCheckoutDetails(body: unknown): DetailsValidation {
  const fail = (error: string, field?: keyof CheckoutDetails): DetailsValidation => ({ ok: false, error, ...(field ? { field } : {}) });
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('Expected a JSON object.');
  const obj = body as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== detailKeys.length || !detailKeys.every((k) => Object.prototype.hasOwnProperty.call(obj, k))) {
    return fail('Unexpected or missing fields.');
  }
  if (typeof obj.sessionId !== 'string' || !sessionIdPattern.test(obj.sessionId)) return fail('Invalid session.', 'sessionId');

  const text = (key: 'buyerName' | 'company' | 'eventName' | 'eventDates', label: string): string | DetailsValidation => {
    const raw = obj[key];
    if (typeof raw !== 'string' || controlChars.test(raw)) return fail(`Enter ${label}.`, key);
    const value = raw.trim().replace(/\s+/g, ' ');
    const { min, max } = detailLimits[key];
    if (value.length < min) return fail(`Enter ${label}.`, key);
    if (value.length > max) return fail(`Keep ${label} under ${max} characters.`, key);
    return value;
  };
  const buyerName = text('buyerName', 'your name');
  if (typeof buyerName !== 'string') return buyerName;
  const company = text('company', 'the company or organization name');
  if (typeof company !== 'string') return company;
  // Optional: private, and only asked for on request, so empty is fine.
  if (typeof obj.eventName !== 'string' || controlChars.test(obj.eventName)) return fail('Enter the event or client name.', 'eventName');
  const eventName = obj.eventName.trim().replace(/\s+/g, ' ');
  if (eventName.length > detailLimits.eventName.max) return fail(`Keep the event or client name under ${detailLimits.eventName.max} characters.`, 'eventName');
  const eventDates = text('eventDates', 'the event date(s), or the start date');
  if (typeof eventDates !== 'string') return eventDates;

  if (typeof obj.vatId !== 'string') return fail('Invalid VAT ID.', 'vatId');
  const vatId = obj.vatId.trim().toUpperCase();
  if (vatId.length > detailLimits.vatId.max || !vatPattern.test(vatId)) return fail('Enter the VAT ID as letters and numbers only.', 'vatId');

  if (obj.business !== true) return fail('Confirm that you are buying for a business.', 'business');
  if (obj.terms !== true) return fail('Accept the terms to continue.', 'terms');
  return { ok: true, value: { sessionId: obj.sessionId, buyerName, company, eventName, eventDates, vatId, business: true, terms: true } };
}

/**
 * The session metadata /api/checkout/details writes. The keys match the
 * hosted custom fields (eventname, eventdates, buyertype) so an order reads
 * the same in the dashboard whichever form took it. Only these keys are
 * sent, and Stripe merges metadata by key, so pack, period, max_servers and
 * founder (set when the session was created) can't be changed through it.
 * `accepted` is the server's time, not the browser's.
 *
 * `buyer_name` has no hosted equivalent (custom fields are capped at 3, and
 * hosted Checkout is already full): it is written only from our own form.
 * It never goes in the license payload or /verify — see payloadForSession.
 */
export function checkoutDetailsMetadata(details: CheckoutDetails, accepted: Date): Record<string, string> {
  return {
    buyer_name: details.buyerName,
    company: details.company,
    ...(details.eventName ? { eventname: details.eventName } : {}),
    eventdates: details.eventDates,
    buyertype: businessBuyerField.optionValue,
    ...(details.vatId ? { vat_id: details.vatId } : {}),
    terms_accepted_at: accepted.toISOString(),
  };
}

/** The session-creation keys details must never overwrite. */
export const protectedMetadataKeys = ['pack', 'period', 'servers', 'tools', 'founder', 'max_servers'] as const;

/** Whether /api/checkout/details may write to this session: our own, custom-mode, still open. */
export function sessionTakesDetails(session: { status: string | null; ui_mode?: string | null; metadata: Record<string, string> | null }): boolean {
  const pack = session.metadata?.pack;
  return session.status === 'open' && session.ui_mode === 'elements' && typeof pack === 'string' && (packIds as readonly string[]).includes(pack);
}

const euVat: Record<string, string> = {
  AT: 'AT', BE: 'BE', BG: 'BG', HR: 'HR', CY: 'CY', CZ: 'CZ', DK: 'DK', EE: 'EE', FI: 'FI', FR: 'FR', DE: 'DE', GR: 'EL', HU: 'HU',
  IE: 'IE', IT: 'IT', LV: 'LV', LT: 'LT', LU: 'LU', MT: 'MT', NL: 'NL', PL: 'PL', PT: 'PT', RO: 'RO', SK: 'SK', SI: 'SI', ES: 'ES', SE: 'SE',
};

/**
 * The Stripe tax ID for a VAT number typed in our form, by the billing
 * country: EU VAT (with the country prefix added when missing), and the
 * European non-EU VAT types. Null for other countries: the number then only
 * goes in the metadata (vat_id).
 */
export function stripeTaxId(country: string, raw: string): { type: 'eu_vat' | 'no_vat' | 'gb_vat' | 'ch_vat' | 'is_vat' | 'li_vat'; value: string } | null {
  const v = raw.toUpperCase().replace(/[\s.\-]/g, '');
  if (!v) return null;
  const prefix = euVat[country];
  if (prefix) return { type: 'eu_vat', value: /^[A-Z]{2}/.test(v) ? v : `${prefix}${v}` };
  if (country === 'NO') {
    const m = /^(?:NO)?(\d{9})(?:MVA)?$/.exec(v);
    return { type: 'no_vat', value: m ? `${m[1]}MVA` : v };
  }
  if (country === 'GB') return { type: 'gb_vat', value: /^GB/.test(v) ? v : `GB${v}` };
  if (country === 'CH') return { type: 'ch_vat', value: raw.trim().toUpperCase() };
  if (country === 'IS') return { type: 'is_vat', value: v };
  if (country === 'LI') return { type: 'li_vat', value: v };
  return null;
}

/** Client IP behind the Cloudflare tunnel; falls back to the first X-Forwarded-For hop. */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return xff || 'unknown';
}

/**
 * Sliding-window limiter kept in memory (one container, so that is enough).
 * Returns true when the request is allowed.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.delete(key);
    hits.set(key, recent);
    // Bound memory: drop the least recently seen keys.
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
    return true;
  };
}
