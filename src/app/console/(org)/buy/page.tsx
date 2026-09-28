import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { founderSalesOpen } from '@/components/pricing';
import { PackPricing } from '@/components/PackPricing';
import { CheckoutProvider } from '@/components/checkout/Checkout';
import { stripePublishableKey } from '@/lib/stripePublishable';
import { PageTitle } from '@/components/console/ConsoleShell';
import { canManage, verifiedEmail } from '@/lib/console/orgs';
import { requireOrg } from '@/lib/console/session';
import { stripeLivemode } from '@/lib/stripeMode';
import { licenseStore } from '@/lib/license/store';
import { getPacks } from '@/lib/stripePrices';
import { DEFAULT_SITE_URL, siteUrl } from '@/lib/site';
import { consoleHref } from '@/lib/console/urls';

export const metadata: Metadata = { title: 'Buy' };
export const dynamic = 'force-dynamic';

// Buying from the console: the same packs and Stripe Checkout (the embedded
// dialog) as the pricing page, but /api/checkout sees who is signed in (the console's own host), so
// the organization's Stripe customer (or your email) is filled in and the new
// license lands in this organization.
export default async function Buy() {
  const { user, org } = await requireOrg();
  const prices = await getPacks();
  let founderOpen = true;
  try {
    founderOpen = founderSalesOpen(await licenseStore().founderCount());
  } catch {
    founderOpen = founderSalesOpen(0);
  }
  const site = siteUrl() ?? DEFAULT_SITE_URL;
  const prefilled = org.stripeCustomerId && stripeLivemode() && canManage(org.role) ? `${org.name}'s billing details` : verifiedEmail(user);

  return (
    <>
      <PageTitle
        sub={
          <>
            New licenses bought here go straight into {org.name}.{prefilled ? ` Checkout starts with ${prefilled} filled in.` : ''} Compare packs, read the
            terms and ask questions on the <a href={`${site}/pricing`}>pricing page</a>.
          </>
        }
      >
        Buy a license
      </PageTitle>
      <Box sx={{ mt: 2 }}>
        <CheckoutProvider publishableKey={prices.source === 'stripe' ? stripePublishableKey() : null}>
          <PackPricing packs={prices.packs} pricesAvailable={prices.source === 'stripe'} founderOpen={founderOpen} />
        </CheckoutProvider>
      </Box>
      <Typography sx={{ mt: 4, fontSize: '0.9375rem' }}>
        Buying for a client instead? <a href={consoleHref('/welcome')}>Add their organization</a> first and switch to it, so the license and invoice are theirs.
      </Typography>
    </>
  );
}
