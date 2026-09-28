import 'server-only';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { importLicenseFile, licenseDataDir, licenseStore } from '../license/store';
import { databaseUrl, db } from './client';
import { pruneExpired } from './prune';
import { dbError } from './errors';
import { checkVatThreshold } from '../vat/threshold';

/**
 * Runs at server start (src/instrumentation.ts): applies pending migrations
 * from ./drizzle (idempotent: drizzle keeps track in drizzle.__drizzle_migrations),
 * then imports licenses.json once (only licenses not in the database yet; the
 * file is left as it is, as a backup), then deletes expired rows (and daily
 * after that, src/lib/db/prune.ts), then checks the VAT threshold (and daily
 * after that; it also runs after every issued live-mode license,
 * src/lib/license/issue.ts). Never throws: a failure is logged, and the
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
