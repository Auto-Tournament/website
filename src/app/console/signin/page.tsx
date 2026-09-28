import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { EmailSignInForm, GoogleSignInButton } from '@/components/console/forms';
import { PageTitle } from '@/components/console/ConsoleShell';
import { consoleEnabled, emailLinkEnabled, googleEnabled } from '@/lib/console/auth';
import { currentUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';
import { seller } from '@/components/seller';
import { signInWithEmail, signInWithGoogle } from '../actions';

const { color } = tokens;

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

// Auth.js sends errors here as ?error=<type>.
const errors: Record<string, string> = {
  Verification: 'That sign-in link has expired or was already used. Ask for a new one.',
  AccessDenied: "Google hasn't verified that email address, so we can't sign you in with it. Use the email link instead.",
  OAuthAccountNotLinked: 'That email is already used with another sign-in method. Use the email link.',
  OAuthCallbackError: "Couldn't sign you in with Google. Try again.",
  Configuration: "Signing in isn't working right now. Try again later, or email us.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await currentUser()) redirect(consoleHref('/'));
  const raw = (await searchParams).error;
  const error = typeof raw === 'string' ? (errors[raw] ?? "Couldn't sign you in. Try again.") : null;
  const enabled = consoleEnabled();
  const email = enabled && emailLinkEnabled();
  const google = enabled && googleEnabled();

  return (
    <>
      <PageTitle sub="See your Auto Tournament licenses and keys, manage your organization and its members, and get your invoices. There is no password: we email you a link, or you use Google.">
        Sign in
      </PageTitle>
      {error && (
        <Typography role="alert" sx={{ mb: 3, color: color.ban }}>
          {error}
        </Typography>
      )}
      {!email && !google ? (
        <Typography>
          Signing in isn&apos;t available right now. Email <a href={`mailto:${seller.email}`}>{seller.email}</a> if you need your license key.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 4 }}>
          {email && <EmailSignInForm action={signInWithEmail} />}
          {google && <GoogleSignInButton action={signInWithGoogle} />}
          <Typography sx={{ fontSize: '0.9375rem', maxWidth: '62ch' }}>
            Bought a license? Sign in with the email you paid with: your organization, made from the details you gave at checkout, is waiting with the license in it.
          </Typography>
        </Box>
      )}
    </>
  );
}
