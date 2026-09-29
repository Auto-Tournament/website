import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { founderSalesOpen } from '@/components/pricing';
import { PackPricing } from '@/components/PackPricing';
import { PackFinder } from '@/components/PackFinder';
import { parseAnswers } from '@/components/findPack';
import { CheckoutProvider } from '@/components/checkout/Checkout';
import { countryFromHeader } from '@/lib/country';
import { stripePublishableKey } from '@/lib/stripePublishable';
import { PageTitle } from '@/components/console/ConsoleShell';
import { db } from '@/lib/db/client';
import { buyHint } from '@/lib/console/buyHint';
import { canManage, licensesForOrg, verifiedEmail } from '@/lib/console/orgs';
import { isStaff } from '@/lib/console/roles';
import { currentOrg, requireUser } from '@/lib/console/session';
import { stripeLivemode } from '@/lib/stripeMode';
import { todayUtc } from '@/lib/license/describe';
import { licenseStore } from '@/lib/license/store';
import { getPacks } from '@/lib/stripePrices';
import { DEFAULT_SITE_URL, siteUrl } from '@/lib/site';
import { consoleHref } from '@/lib/console/urls';

export const metadata: Metadata = { title: 'Buy' };
export const dynamic = 'force-dynamic';

// Buying from the console: the pricing guide (PackFinder, context "console":
// no "does anyone earn money?" step) and the pack cards below it, on the same
// Stripe checkout as the pricing page. /api/checkout sees who is signed in
// (the console's own host), so the organization's Stripe customer (or your
// email) is used and the new license lands in this organization; the form
// starts with the organization's name, VAT ID and address. Without an
// organization yet, checkout makes one. Server providers can't buy here.
export default async function Buy({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const current = await currentOrg(user);
  const org = current?.org ?? null;
  if (org && !isStaff(org.role)) redirect(consoleHref('/licenses'));
  const [prices, initial] = await Promise.all([getPacks(), searchParams.then(parseAnswers)]);
  let founderOpen = true;
  try {
    founderOpen = founderSalesOpen(await licenseStore().founderCount());
  } catch {
    founderOpen = founderSalesOpen(0);
  }
  const site = siteUrl() ?? DEFAULT_SITE_URL;
  const prefilled = org?.stripeCustomerId && stripeLivemode() && canManage(org.role) ? `${org.name}'s billing details` : verifiedEmail(user);
  const hint = org ? buyHint((await licensesForOrg(db(), user.id, org.id)).map((r) => r.payload), prices.packs, todayUtc()) : null;
  const defaults = org
    ? {
        company: org.name,
        vatId: org.vatId ?? org.orgNumber ?? '',
        country: org.country ?? '',
        line1: org.addressLine1 ?? '',
        line2: org.addressLine2 ?? '',
        postal_code: org.postalCode ?? '',
        city: org.city ?? '',
      }
    : null;
  const pricesAvailable = prices.source === 'stripe';

  return (
    <>
      <PageTitle
        sub={
          <>
            {org ? `New licenses bought here go straight into ${org.name}.` : 'Your organization is set up from your checkout.'}
            {prefilled ? ` Checkout starts with ${prefilled} filled in.` : ''} Read the terms and ask questions on the <a href={`${site}/pricing`}>pricing page</a>.
          </>
        }
      >
        Buy a license
      </PageTitle>
      <CheckoutProvider publishableKey={pricesAvailable ? stripePublishableKey() : null} country={countryFromHeader((await headers()).get('cf-ipcountry'))} defaults={defaults}>
        {hint && (
          <Typography data-testid="buy-hint" sx={{ mt: 2, mb: 2, fontSize: '0.9375rem' }}>
            {hint}
          </Typography>
        )}
        <Box id="guide" sx={{ mt: 2, scrollMarginTop: 80 }}>
          <PackFinder packs={prices.packs} pricesAvailable={pricesAvailable} founderOpen={founderOpen} initial={initial} context="console" />
        </Box>
        <Box component="section" aria-labelledby="buy-packs" sx={{ mt: 6 }}>
          <Typography id="buy-packs" component="h2" sx={{ mb: 2, fontSize: '1.25rem', fontWeight: 600 }}>
            Know what you want? Pick a pack
          </Typography>
          <PackPricing packs={prices.packs} pricesAvailable={pricesAvailable} founderOpen={founderOpen} />
        </Box>
      </CheckoutProvider>
    </>
  );
}
