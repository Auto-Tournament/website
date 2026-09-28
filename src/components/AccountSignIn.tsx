'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';

const { color } = tokens;

/** Email → POST /api/account/link, which emails a sign-in link when that email has a license. */
export function AccountSignIn() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/account/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (res.ok && data?.message) setMessage(data.message);
      else setError(data?.error ?? 'Something went wrong. Try again, or email us.');
    } catch {
      setError("Couldn't reach the site. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ mt: 3, display: 'grid', gap: 2, maxWidth: 520 }}>
      <TextField label="Email used at checkout" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <Box>
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? 'Sending…' : 'Email me a sign-in link'}
        </Button>
      </Box>
      {message && (
        <Typography role="status" sx={{ color: color.ink2 }}>
          {message}
        </Typography>
      )}
      {error && (
        <Typography role="alert" sx={{ color: color.ink2 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
