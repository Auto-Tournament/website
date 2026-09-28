import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { ApprovedForm } from '@/components/admin/Passkeys';
import { TermsFields } from '@/components/admin/TermsFields';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { listAllOrgs } from '@/lib/admin/customers';
import { getLead } from '@/lib/admin/leads';
import { founderStatus } from '@/lib/admin/overview';
import { createManualAction } from '../../actions';

export const metadata: Metadata = { title: 'New license' };
export const dynamic = 'force-dynamic';

export default async function NewManualLicense({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const leadId = typeof sp.lead === 'string' ? sp.lead : '';
  const [orgs, founder, lead] = await Promise.all([listAllOrgs(db()), founderStatus(db()), leadId ? getLead(db(), leadId) : Promise.resolve(null)]);

  return (
    <>
      <PageTitle sub="A license paid by bank transfer or invoice, outside Stripe. Paid: the key is issued now. Not paid yet: the order waits, and “Mark paid” issues the key. It counts as revenue once paid.">
        New license
      </PageTitle>
      <Panel>
        <ApprovedForm action={createManualAction} approval={{ action: 'license.create', target: 'new' }} submitLabel="Create" pendingLabel="Creating…" columns={2} testId="manual-form">
          <TermsFields mode="new" values={{ licensee: lead?.organization ?? '' }} />
          <TextField
            select
            name="orgId"
            label="Organization (optional)"
            defaultValue=""
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            sx={{ gridColumn: '1 / -1' }}
          >
            <option value="">None</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </TextField>
          <TextField
            name="email"
            label="Buyer email (optional)"
            type="email"
            autoComplete="off"
            defaultValue={lead?.email ?? ''}
            helperText="Kept only as a hash, like card purchases: it lets the buyer find the key at /license and in the console."
            slotProps={{ htmlInput: { maxLength: 254 } }}
            sx={{ gridColumn: '1 / -1' }}
          />
          <TextField name="amount" label="Amount (excl. VAT)" required inputMode="decimal" slotProps={{ htmlInput: { maxLength: 15 } }} />
          <TextField select name="currency" label="Currency" defaultValue="eur" slotProps={{ select: { native: true } }}>
            <option value="eur">EUR</option>
            <option value="nok">NOK</option>
          </TextField>
          <TextField name="paymentRef" label="Payment reference" helperText="Invoice number or bank reference." slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField select name="paid" label="Paid?" defaultValue="no" slotProps={{ select: { native: true } }}>
            <option value="no">Not yet: no key until marked paid</option>
            <option value="yes">Paid: issue the key now</option>
          </TextField>
          <TextField select name="send" label="Email the key to the buyer" defaultValue="yes" helperText="When paid and an email is given." slotProps={{ select: { native: true } }}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </TextField>
        </ApprovedForm>
      </Panel>
      <Box sx={{ mt: 2, fontSize: '0.875rem' }}>
        Founder places taken: {founder.taken} of {founder.limit} (unpaid founder orders hold a place).
      </Box>
    </>
  );
}
