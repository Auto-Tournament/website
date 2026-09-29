import type { Metadata } from 'next';
import Typography from '@mui/material/Typography';
import { ActionButton, OrgForm } from '@/components/console/forms';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { countryOptions } from '@/lib/console/countries';
import { canManage } from '@/lib/console/orgs';
import { requireOrg } from '@/lib/console/session';
import { billingPortalAction, updateOrgAction } from '../../actions';

export const metadata: Metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

export default async function Billing() {
  const { org } = await requireOrg({ staff: true });
  const manage = canManage(org.role);
  const values = {
    name: org.name,
    orgNumber: org.orgNumber ?? '',
    vatId: org.vatId ?? '',
    country: org.country ?? '',
    addressLine1: org.addressLine1 ?? '',
    addressLine2: org.addressLine2 ?? '',
    postalCode: org.postalCode ?? '',
    city: org.city ?? '',
  };

  return (
    <>
      <PageTitle sub="Invoices, receipts and payment details are kept by Stripe, our payment provider.">Billing</PageTitle>

      <Panel title="Invoices and payment details">
        {!manage ? (
          <Typography>Only owners and admins of {org.name} can see invoices and payment details.</Typography>
        ) : org.stripeCustomerId ? (
          <>
            <Typography sx={{ mb: 2, fontSize: '0.9375rem' }}>Opens Stripe&apos;s billing page for {org.name}: download invoices and receipts, and update the billing details.</Typography>
            <ActionButton action={billingPortalAction} fields={{ orgId: org.id }} label="Invoices and payment details" pendingLabel="Opening Stripe…" variant="contained" size="medium" />
          </>
        ) : (
          <Typography>
            No invoices yet. They show up here after a purchase from the Buy page, or once you add a license bought with your email to {org.name}.
          </Typography>
        )}
      </Panel>

      <Panel title="Organization details">
        <Typography sx={{ mb: 3, fontSize: '0.9375rem' }}>
          {manage ? 'Used for new orders and invoices. Invoices already sent keep the details they had.' : 'Owners and admins can change these.'}
        </Typography>
        <OrgForm action={updateOrgAction} countries={countryOptions()} values={values} orgId={org.id} submitLabel="Save" readOnly={!manage} />
      </Panel>
    </>
  );
}
