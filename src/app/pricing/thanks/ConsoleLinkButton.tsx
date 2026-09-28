'use client';

import { useActionState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import type { ConsoleLinkState } from '@/lib/console/checkoutSignIn';

const { color } = tokens;

type Action = (prev: ConsoleLinkState, fd: FormData) => Promise<ConsoleLinkState>;
type View = { sentTo: string | null; error: string | null };

/**
 * "Go to your console" on the thanks page. Sends only the order's session id:
 * the server emails the sign-in link to the address used at checkout and
 * answers with that address masked.
 */
export function ConsoleLinkButton({ action, sessionId }: { action: Action; sessionId: string }) {
  // A failed "Send again" keeps the address shown: the first link is still on its way.
  const [view, run, pending] = useActionState<View, FormData>(async (prev, fd) => {
    let res: ConsoleLinkState;
    try {
      res = await action(null, fd);
    } catch {
      res = { ok: false, error: "Couldn't send the sign-in email. Try again in a few minutes." };
    }
    return res?.ok ? { sentTo: res.sentTo, error: null } : { sentTo: prev.sentTo, error: res?.error ?? null };
  }, { sentTo: null, error: null });
  const sent = view.sentTo;
  return (
    <Box component="form" action={run} data-testid="console-link" sx={{ mt: 4, display: 'grid', gap: 1.5, justifyItems: 'start' }}>
      <input type="hidden" name="session_id" value={sessionId} />
      {sent ? (
        <>
          <Typography role="status" sx={{ maxWidth: '60ch', color: color.ink, fontSize: '1.125rem' }}>
            Check your email: we sent a sign-in link to <strong>{sent}</strong>
          </Typography>
          <Typography sx={{ color: color.ink2 }}>
            Didn&apos;t get it?{' '}
            <Button type="submit" variant="text" size="small" disabled={pending} sx={{ p: 0, minWidth: 0, verticalAlign: 'baseline', textDecoration: 'underline' }}>
              {pending ? 'Sending…' : 'Send again'}
            </Button>
          </Typography>
        </>
      ) : (
        <>
          <Button type="submit" variant="contained" size="large" disabled={pending}>
            {pending ? 'Sending…' : 'Go to your console'}
          </Button>
          <Typography sx={{ color: color.ink2 }}>We&apos;ll email a sign-in link to the address you paid with.</Typography>
        </>
      )}
      {view.error && (
        <Typography role="alert" sx={{ maxWidth: '60ch', color: color.ban }}>
          {view.error}
        </Typography>
      )}
    </Box>
  );
}
