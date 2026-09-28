import 'server-only';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { importLicenseFile, licenseDataDir, licenseStore } from '../license/store';
import { databaseUrl, db } from './client';
import { pruneExpired } from './prune';
import { dbError } from './errors';
import { syncAllAdmins } from '../admin/access';
import { checkVatThreshold } from '../vat/threshold';
import { backfillCheckoutOrgs } from '../console/checkoutOrg';
import { stripeServer } from '../license/issue';
import { stripeLivemode } from '../stripeMode';

/**
 * Runs at server start (src/instrumentation.ts): applies pending migrations
 * from ./drizzle (idempotent: drizzle keeps track in drizzle.__drizzle_migrations),
 * then imports licenses.json once (only licenses not in the database yet; the
 * file is left as it is, as a backup), then deletes expired rows (and daily
 * after that, src/lib/db/prune.ts), then checks the VAT threshold (and daily
 * after that; it also runs after every issued live-mode license,
 * src/lib/license/issue.ts), then (in the background) puts older card
 * licenses into organizations from their checkout details, once per license
 * (src/lib/console/checkoutOrg.ts). Never throws: a failure is logged, and the
 * marketing pages keep working while license issuing answers 500 (Stripe
 * retries) until the next start.
 */
export async function startDatabase(): Promise<void> {
  if (!databaseUrl()) {
    console.error('[db] DATABASE_URL is not set: license keys and the console are off');
    return;
  }
  try {
    const started = Date.now();
    await migrate(db() as unknown as PostgresJsDatabase, { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), 'drizzle') });
    console.info('[db] migrations up to date', { ms: Date.now() - started });
  } catch (err) {
    console.error('[db] migrations failed', dbError(err));
    return;
  }
  try {
    const result = await importLicenseFile(licenseStore(), licenseDataDir());
    // Counts only: never the emails (the file has none) or keys.
    if (result) console.info('[license] licenses.json import', { inFile: result.inFile, imported: result.imported });
  } catch (err) {
    console.error('[license] licenses.json import failed', dbError(err));
  }
  try {
    // Counts only, never addresses.
    const changed = await syncAllAdmins(db());
    if (changed.granted + changed.revoked > 0) console.info('[admin] ADMIN_EMAILS applied', changed);
  } catch (err) {
    console.error('[admin] ADMIN_EMAILS sync failed', dbError(err));
  }
  // In the background: it asks Stripe once per older license, and must not hold up the start.
  const stripe = stripeServer();
  if (stripe) {
    backfillCheckoutOrgs(db(), { retrieve: (id) => stripe.checkout.sessions.retrieve(id), stripeLivemode: stripeLivemode() })
      .then((r) => {
        if (r.checked > 0) console.info('[license] organizations from checkout (older licenses)', r);
      })
      .catch((err) => console.error('[license] organizations from checkout failed', dbError(err)));
  }
  const prune = () =>
    pruneExpired(db())
      .then((deleted) => console.info('[db] pruned expired rows', deleted))
      .catch((err) => console.error('[db] pruning failed', dbError(err)));
  await prune();
  setInterval(prune, 24 * 60 * 60_000).unref();

  const checkVat = () => checkVatThreshold().catch((err) => console.error('[vat] threshold check failed', dbError(err)));
  await checkVat();
  setInterval(checkVat, 24 * 60 * 60_000).unref();
}
