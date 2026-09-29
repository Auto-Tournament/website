import type { Metadata } from 'next';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/console/ConsoleShell';
import { AutoSubmitForm } from '@/components/console/AutoSubmitForm';
import { consoleHref, consoleUrl } from '@/lib/console/urls';

// Where the emailed sign-in link lands. The server render does nothing by
// itself (mail scanners that fetch links don't use the token up); in a real
// browser the form submits itself to Auth.js's email callback, which signs in
// and comes back to the console. The button is the fallback without scripts.
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
        <AutoSubmitForm action="/api/auth/callback/email">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="callbackUrl" value={consoleUrl('/')} />
          <Typography role="status">Signing you in…</Typography>
          <Button type="submit" variant="contained">
            Sign in
          </Button>
        </AutoSubmitForm>
      ) : (
        <Typography>
          This sign-in link isn&apos;t valid. <a href={consoleHref('/signin')}>Ask for a new one</a>.
        </Typography>
      )}
    </>
  );
}
