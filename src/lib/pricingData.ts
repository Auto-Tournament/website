import 'server-only';
import { cache } from 'react';
import { founderSalesOpen } from '@/components/pricing';
import { getPacks } from '@/lib/stripePrices';
import { licenseStore } from '@/lib/license/store';

/**
 * Packs + founder-sales-open, fetched once per request no matter how many
 * Suspense-boundary child components ask for it (each does, so the hero and
 * the rest of the page can render before this data is ready). getPacks()
 * already caches across requests for 5 minutes; this only dedupes the one
 * request currently in flight.
 */
export const getPricingData = cache(async () => {
  const priceSource = await getPacks();
  let founderOpen = true;
  try {
    founderOpen = founderSalesOpen(await licenseStore().founderCount());
  } catch {
    founderOpen = founderSalesOpen(0);
  }
  return {
    packs: priceSource.packs,
    pricesAvailable: priceSource.source === 'stripe',
    founderOpen,
  };
});
