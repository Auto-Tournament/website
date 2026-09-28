'use client';

import { useActionState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import { Status } from '@/components/console/forms';
import type { ActionState } from '@/app/console/actions';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** "20", "20.5", "1 234,50" → minor units; null when it isn't an amount (the server checks again). */
function minor(raw: string): number | null {
  const s = raw.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

const fmt = (amount: number, currency: string) => `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;

/**
 * The Refund form on the admin license page. Before it runs, the browser's
 * own dialog shows the amount and the license, so a refund is never one click.
 */
export function RefundForm({
  action,
  licenseId,
  licensee,
  currency,
  left,
  via,
}: {
  action: Action;
  licenseId: string;
  licensee: string;
  currency: string;
  /** What is left to refund (minor units), as far as this site knows; null when unknown. */
  left: number | null;
  via: 'stripe' | 'manual';
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <Box
      component="form"
      action={run}
      data-testid="refund-form"
      onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
        const fd = new FormData(e.currentTarget);
        const raw = String(fd.get('amount') ?? '').trim();
        const amount = raw ? minor(raw) : left;
        if (raw && amount === null) return; // The server answers with the message.
        const full = amount === null || left === null || amount >= left;
        const what = amount === null ? 'the full amount' : fmt(amount, currency);
        const message = [
          `${via === 'stripe' ? 'Refund' : 'Record a refund of'} ${what} for license ${licenseId} (${licensee})?`,
          via === 'stripe' ? 'The money goes back to the buyer’s card through Stripe.' : 'Nothing is sent anywhere: this only records the refund you made.',
          full ? 'The license will be marked refunded (revoked).' : 'Partial refund: the license stays valid.',
          "This can't be undone.",
        ].join('\n\n');
        if (!window.confirm(message)) e.preventDefault();
      }}
      sx={{ display: 'grid', gap: 2, minWidth: 0 }}
    >
      <input type="hidden" name="licenseId" value={licenseId} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, '& > *': { minWidth: 0 } }}>
        <TextField
          name="amount"
          label={`Amount, ${currency.toUpperCase()} (optional)`}
          inputMode="decimal"
          helperText={left !== null ? `Empty: the full ${fmt(left, currency)} left.` : 'Empty: everything not refunded yet.'}
          slotProps={{ htmlInput: { maxLength: 15 } }}
        />
        <TextField select name="reason" label="Reason" defaultValue="requested_by_customer" slotProps={{ select: { native: true } }}>
          <option value="requested_by_customer">Requested by the customer</option>
          <option value="duplicate">Duplicate payment</option>
          <option value="fraudulent">Fraudulent</option>
        </TextField>
        {via === 'manual' && (
          <>
            <TextField name="refundedOn" label="Refunded on (YYYY-MM-DD, empty: today)" slotProps={{ htmlInput: { maxLength: 10 } }} />
            <TextField name="reference" label="Bank reference (optional)" slotProps={{ htmlInput: { maxLength: 200 } }} />
          </>
        )}
        <TextField name="note" label="Note (optional)" multiline minRows={2} slotProps={{ htmlInput: { maxLength: 4000 } }} sx={{ gridColumn: '1 / -1' }} />
        <FormControlLabel control={<Checkbox name="notify" value="yes" />} label="Email the buyer that the license was refunded" sx={{ gridColumn: '1 / -1' }} />
        <TextField
          name="sendTo"
          label="Buyer email (optional)"
          type="email"
          autoComplete="off"
          helperText={`Only the address it was bought with works.${via === 'stripe' ? ' Empty: the one from the Stripe checkout.' : ''}`}
          slotProps={{ htmlInput: { maxLength: 254 } }}
          sx={{ gridColumn: '1 / -1' }}
        />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Button type="submit" variant="outlined" color="error" disabled={pending}>
          {pending ? 'Refunding…' : via === 'stripe' ? 'Refund' : 'Record refund'}
        </Button>
        <Status state={state} />
      </Box>
    </Box>
  );
}
