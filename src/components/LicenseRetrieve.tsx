'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import type { LicensePayload } from '@/lib/license/format';
import { LicenseKeyView } from './LicenseKeyView';

const { color } = tokens;

/**
 * Order reference (or invoice number) + email → the license key, from POST
 * /api/license/retrieve. With email on, "Email it to me again" asks POST
 * /api/license/resend to send it to that address.
 */
export function LicenseRetrieve({ emailEnabled = false }: { emailEnabled?: boolean }) {
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ token: string; license: LicensePayload } | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const resend = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    if (form && !form.reportValidity()) return;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const res = await fetch('/api/license/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference, email }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (res.ok && data?.message) setSent(data.message);
      else setError(data?.error ?? 'Something went wrong. Try again, or email us.');
    } catch {
      setError("Couldn't reach the site. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFound(null);
    setSent(null);
    try {
      const res = await fetch('/api/license/retrieve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference, email }),
      });
      const data = (await res.json().catch(() => null)) as { token?: string; license?: LicensePayload; error?: string } | null;
      if (res.ok && data?.token && data.license) setFound({ token: data.token, license: data.license });
      else setError(data?.error ?? 'Something went wrong. Try again, or email us.');
    } catch {
      setError("Couldn't reach the site. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Box component="form" onSubmit={submit} sx={{ mt: 3, display: 'grid', gap: 2, maxWidth: 520 }}>
        <TextField
          label="Order reference or invoice number"
          helperText="cs_… from the thanks page, or the invoice number on your Stripe receipt"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
          autoComplete="off"
          slotProps={{ htmlInput: { maxLength: 260, spellCheck: false } }}
        />
        <TextField label="Email used at checkout" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Looking…' : 'Show my license key'}
          </Button>
          {emailEnabled && (
            <Button type="button" variant="outlined" disabled={busy} onClick={resend}>
              Email it to me again
            </Button>
          )}
        </Box>
        {sent && (
          <Typography role="status" sx={{ color: color.ink2 }}>
            {sent}
          </Typography>
        )}
        {error && (
          <Typography role="alert" sx={{ color: color.ink2 }}>
            {error}
          </Typography>
        )}
      </Box>
      {found && <LicenseKeyView token={found.token} license={found.license} />}
    </Box>
  );
}
