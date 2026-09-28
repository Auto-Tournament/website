import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/console/ConsoleShell';
import { consoleHref, consoleUrl } from '@/lib/console/urls';

// Where the emailed sign-in link lands. Opening it does nothing by itself (mail
// scanners that open links don't use it up): the button sends the token to
// Auth.js's email callback, which signs in and comes back to the console.
export const metadata: Metadata = {
  title: 'Sign in',
  // The URL carries the sign-in token: send only the origin onwards.
  referrer: 'strict-origin',
};

export const dynamic = 'force-dynamic';

export default async function ConfirmSignIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(raw) ? raw : null;
  return (
    <>
      <PageTitle>Sign in</PageTitle>
      {token ? (
        <Box component="form" method="get" action="/api/auth/callback/email" sx={{ display: 'grid', gap: 2, justifyItems: 'start' }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="callbackUrl" value={consoleUrl('/')} />
          <Typography>Continue to sign in to the Auto Tournament console.</Typography>
          <Button type="submit" variant="contained">
            Sign in
          </Button>
        </Box>
      ) : (
        <Typography>
          This sign-in link isn&apos;t valid. <a href={consoleHref('/signin')}>Ask for a new one</a>.
        </Typography>
      )}
    </>
  );
}
