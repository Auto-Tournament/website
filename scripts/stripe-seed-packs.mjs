#!/usr/bin/env node
/**
 * Creates or updates the six license packs in Stripe: one Product per pack and
 * three one-time EUR Prices per Product (per event, yearly, founding
 * supporter). Stripe is the source of truth for pack prices: the website reads
 * these prices by lookup key (src/lib/stripePrices.ts).
 *
 * Idempotent. Run it again after editing PACKS below:
 * - Products are found by metadata.pack_id and updated in place (name,
 *   description, metadata, tax code).
 * - Stripe prices can't change amount, so a changed amount creates a new
 *   price, moves the lookup key to it (transfer_lookup_key) and deactivates
 *   the old one. Old prices stay in Stripe as history.
 *
 * Usage (see README → "Changing prices"):
 *   STRIPE_ADMIN_KEY=... node scripts/stripe-seed-packs.mjs [--dry-run] [--archive-v1]
 *
 *   --dry-run     print the plan, change nothing
 *   --archive-v1  also archive the four old per-seat v1 products
 *
 * STRIPE_ADMIN_KEY: a restricted key with these permissions, nothing else:
 *   - Products: Write
 *   - Prices:   Write
 * (Write includes read.) The key is never printed. It is not the website's
 * STRIPE_SECRET_KEY, which only needs read access to these.
 */
import Stripe from 'stripe';

/**
 * The price table. Amounts in whole euros; maxServers is the most game
 * servers set up at any one time, spares included. Must increase S < M < L.
 * Keep src/components/pricing.ts FALLBACK_PACKS roughly in step: it is only
 * shown when Stripe can't be read.
 */
const PACKS = [
  { id: 'servers-s', product: 'servers', size: 'S', maxServers: 5, prices: { event: 19, year: 49, founder: 79 } },
  { id: 'servers-m', product: 'servers', size: 'M', maxServers: 15, prices: { event: 49, year: 129, founder: 199 } },
  { id: 'servers-l', product: 'servers', size: 'L', maxServers: 40, prices: { event: 99, year: 279, founder: 399 } },
  { id: 'platform-s', product: 'platform', size: 'S', maxServers: 5, prices: { event: 39, year: 99, founder: 149 } },
  { id: 'platform-m', product: 'platform', size: 'M', maxServers: 15, prices: { event: 79, year: 219, founder: 329 } },
  { id: 'platform-l', product: 'platform', size: 'L', maxServers: 40, prices: { event: 149, year: 429, founder: 599 } },
];

const PERIODS = ['event', 'year', 'founder'];

const periodNickname = { event: 'per event', year: 'yearly', founder: 'founding supporter' };
const productTitle = { servers: 'Servers', platform: 'Platform' };
const productCovers = {
  servers: 'CS2 Server Manager and Ready Up',
  platform: 'the Auto Tournament platform, CS2 Server Manager, Ready Up and the game packs used with it',
};

/** Downloadable software, business use. */
const TAX_CODE = 'txcd_10202003';
const CURRENCY = 'eur';

/** The per-seat products from Pricing v1, archived with --archive-v1. */
const V1_PRODUCT_NAMES = [
  'Servers license: per event',
  'Servers license: yearly',
  'Platform license: per event',
  'Platform license: yearly',
];

const lookupKey = (packId, period) => `${packId.replace('-', '_')}_${period}`;
const euro = (cents) => `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

function desiredProduct(pack) {
  const title = `${productTitle[pack.product]} ${pack.size}`;
  return {
    name: `${title} license (up to ${pack.maxServers} servers)`,
    description: `Commercial license for ${productCovers[pack.product]}. No more than ${pack.maxServers} game servers set up at any one time, spares included.`,
    metadata: { pack_id: pack.id, product: pack.product, size: pack.size, max_servers: String(pack.maxServers) },
    tax_code: TAX_CODE,
  };
}

function desiredPrice(pack, period) {
  return {
    lookup_key: lookupKey(pack.id, period),
    unit_amount: pack.prices[period] * 100,
    nickname: `${productTitle[pack.product]} ${pack.size} — ${periodNickname[period]}`,
    metadata: { pack_id: pack.id, period },
  };
}

function checkTable() {
  const problems = [];
  const ids = new Set();
  for (const pack of PACKS) {
    if (ids.has(pack.id)) problems.push(`${pack.id}: listed twice`);
    ids.add(pack.id);
    if (!Number.isInteger(pack.maxServers) || pack.maxServers < 1) problems.push(`${pack.id}: maxServers must be a whole number of 1 or more`);
    for (const period of PERIODS) {
      const amount = pack.prices[period];
      if (!Number.isInteger(amount) || amount <= 0) problems.push(`${pack.id} ${period}: price must be a whole number of euros above 0`);
    }
  }
  for (const product of ['servers', 'platform']) {
    const sizes = ['S', 'M', 'L'].map((size) => PACKS.find((p) => p.product === product && p.size === size));
    if (sizes.some((p) => !p)) problems.push(`${product}: needs an S, M and L pack`);
    else if (!(sizes[0].maxServers < sizes[1].maxServers && sizes[1].maxServers < sizes[2].maxServers)) {
      problems.push(`${product}: maxServers must increase S < M < L`);
    }
  }
  return problems;
}

/** Only our metadata keys are compared; keys added by hand in the dashboard are left alone. */
const metadataDiffers = (actual, wanted) => Object.entries(wanted).some(([k, v]) => (actual ?? {})[k] !== v);

const taxCodeOf = (product) => (typeof product.tax_code === 'string' ? product.tax_code : product.tax_code?.id ?? null);

function productChanges(existing, wanted) {
  const changes = {};
  if (existing.name !== wanted.name) changes.name = wanted.name;
  if (existing.description !== wanted.description) changes.description = wanted.description;
  if (metadataDiffers(existing.metadata, wanted.metadata)) changes.metadata = wanted.metadata;
  if (taxCodeOf(existing) !== wanted.tax_code) changes.tax_code = wanted.tax_code;
  if (!existing.active) changes.active = true;
  return changes;
}

/** Can this existing price stand for the wanted one? Amount, currency and type can't be edited in Stripe. */
function priceMatches(existing, productId, wanted) {
  return (
    existing.product === productId &&
    existing.currency === CURRENCY &&
    existing.unit_amount === wanted.unit_amount &&
    existing.type === 'one_time' &&
    existing.recurring === null &&
    existing.billing_scheme === 'per_unit' &&
    existing.custom_unit_amount === null &&
    existing.transform_quantity === null &&
    existing.tax_behavior === 'exclusive'
  );
}

function priceChanges(existing, wanted) {
  const changes = {};
  if (!existing.active) changes.active = true;
  if (existing.nickname !== wanted.nickname) changes.nickname = wanted.nickname;
  if (metadataDiffers(existing.metadata, wanted.metadata)) changes.metadata = wanted.metadata;
  return changes;
}

/** Never print the key: scrub anything that looks like one from error text. */
const scrub = (text) => String(text ?? '').replace(/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9*]+/g, '[key]');

function printError(err) {
  if (err instanceof Stripe.errors.StripeError) {
    console.error(`\nStripe error: ${err.type}${err.code ? ` (${err.code})` : ''}, HTTP ${err.statusCode ?? '?'}, request ${err.requestId ?? '?'}`);
    if (err.type === 'StripeAuthenticationError') console.error('The key was not accepted. Check that you pasted the whole key.');
    else if (err.type === 'StripePermissionError') console.error('The key lacks a permission. It needs Products: Write and Prices: Write.');
    else console.error(scrub(err.message));
  } else {
    console.error(`\nFailed: ${scrub(err instanceof Error ? err.message : err)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const known = new Set(['--dry-run', '--archive-v1', '--help', '-h']);
  const unknown = args.filter((a) => !known.has(a));
  if (args.includes('--help') || args.includes('-h') || unknown.length > 0) {
    if (unknown.length > 0) console.error(`Unknown option: ${unknown.join(' ')}`);
    console.error('Usage: STRIPE_ADMIN_KEY=... node scripts/stripe-seed-packs.mjs [--dry-run] [--archive-v1]');
    process.exit(unknown.length > 0 ? 2 : 0);
  }
  const dryRun = args.includes('--dry-run');
  const archiveV1 = args.includes('--archive-v1');

  const key = process.env.STRIPE_ADMIN_KEY?.trim();
  if (!key) {
    console.error('STRIPE_ADMIN_KEY is not set. See the README section "Changing prices" for the command.');
    process.exit(2);
  }
  const mode = /^(sk|rk)_live_/.test(key) ? 'LIVE' : /^(sk|rk)_test_/.test(key) ? 'test' : null;
  if (!mode) {
    console.error('STRIPE_ADMIN_KEY does not look like a Stripe secret or restricted key (sk_… or rk_…).');
    process.exit(2);
  }

  const problems = checkTable();
  if (problems.length > 0) {
    console.error(`The PACKS table has problems:\n- ${problems.join('\n- ')}`);
    process.exit(2);
  }

  const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 30_000 });
  console.log(`Stripe ${mode} mode${dryRun ? ', dry run: nothing will be changed' : ''}\n`);

  // Every product, active or archived, to find ours by metadata.pack_id.
  const allProducts = [];
  for await (const product of stripe.products.list({ limit: 100 })) allProducts.push(product);

  /** @type {{ describe: string, run: () => Promise<void> }[]} */
  const steps = [];
  const step = (describe, run) => steps.push({ describe, run });
  let unchanged = 0;

  for (const pack of PACKS) {
    const wanted = desiredProduct(pack);
    const found = allProducts.filter((p) => p.metadata?.pack_id === pack.id);
    const active = found.filter((p) => p.active);
    if (active.length > 1) {
      throw new Error(`Several active products have metadata.pack_id ${pack.id} (${active.map((p) => p.id).join(', ')}). Archive the extra ones in the dashboard and run again.`);
    }
    const existing = active[0] ?? found[0] ?? null;

    // The product id is only known after creating it, so later steps read it from here.
    const ref = { id: existing?.id ?? null };
    if (!existing) {
      step(`create product "${wanted.name}"`, async () => {
        const created = await stripe.products.create({ ...wanted, active: true });
        ref.id = created.id;
      });
    } else {
      const changes = productChanges(existing, wanted);
      if (Object.keys(changes).length > 0) {
        step(`update product ${existing.id} "${wanted.name}": ${Object.keys(changes).join(', ')}`, async () => {
          await stripe.products.update(existing.id, changes);
        });
      } else {
        unchanged++;
      }
    }

    // Current holders of our three lookup keys, active or not.
    const keys = PERIODS.map((period) => lookupKey(pack.id, period));
    const holders = existing ? (await stripe.prices.list({ lookup_keys: keys, limit: 10 })).data : [];

    for (const period of PERIODS) {
      const want = desiredPrice(pack, period);
      const holder = holders.find((p) => p.lookup_key === want.lookup_key) ?? null;
      if (holder && existing && priceMatches(holder, existing.id, want)) {
        const changes = priceChanges(holder, want);
        if (Object.keys(changes).length > 0) {
          step(`update price ${holder.id} ${want.lookup_key} ${euro(want.unit_amount)}: ${Object.keys(changes).join(', ')}`, async () => {
            await stripe.prices.update(holder.id, changes);
          });
        } else {
          unchanged++;
        }
        continue;
      }
      const replaces = holder ? ` (replaces ${holder.id} at ${holder.unit_amount === null ? 'no fixed amount' : euro(holder.unit_amount)}, which gets deactivated)` : '';
      step(`create price ${want.lookup_key} ${euro(want.unit_amount)} "${want.nickname}"${replaces}`, async () => {
        await stripe.prices.create({
          product: ref.id,
          currency: CURRENCY,
          unit_amount: want.unit_amount,
          tax_behavior: 'exclusive',
          lookup_key: want.lookup_key,
          transfer_lookup_key: true,
          nickname: want.nickname,
          metadata: want.metadata,
        });
        // Only after the new price holds the lookup key.
        if (holder?.active) await stripe.prices.update(holder.id, { active: false });
      });
    }
  }

  if (archiveV1) {
    const v1 = allProducts.filter((p) => p.active && V1_PRODUCT_NAMES.includes(p.name));
    const missing = V1_PRODUCT_NAMES.filter((name) => !allProducts.some((p) => p.name === name && p.active));
    if (missing.length > 0) console.log(`v1 products not found or already archived: ${missing.map((n) => `"${n}"`).join(', ')}\n`);
    for (const product of v1) {
      step(`archive v1 product ${product.id} "${product.name}"`, async () => {
        await stripe.products.update(product.id, { active: false });
      });
    }
  }

  if (steps.length === 0) {
    console.log(`Nothing to change: all 6 products and 18 prices are up to date.`);
    return;
  }
  console.log(`${dryRun ? 'Would' : 'Will'} do ${steps.length} change(s) (${unchanged} already up to date):`);
  for (const s of steps) console.log(`- ${s.describe}`);
  if (dryRun) {
    console.log('\nDry run: nothing changed. Run again without --dry-run to apply.');
    return;
  }

  console.log('');
  for (const s of steps) {
    await s.run();
    console.log(`done: ${s.describe}`);
  }
  console.log('\nAll done. The website picks up the new prices within 5 minutes.');
}

main().catch((err) => {
  printError(err);
  process.exit(1);
});
