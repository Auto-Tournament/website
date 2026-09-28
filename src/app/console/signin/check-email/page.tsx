import type { Metadata } from 'next';
import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/console/ConsoleShell';
import { consoleHref } from '@/lib/console/urls';

export const metadata: Metadata = { title: 'Check your email' };

export default function CheckEmail() {
  return (
    <>
      <PageTitle>Check your email</PageTitle>
      <Typography sx={{ maxWidth: '62ch' }} data-testid="check-email">
        We&apos;ve sent you a sign-in link. It works once, for 15 minutes. Nothing there after a few minutes? Check the spam folder, or{' '}
        <a href={consoleHref('/signin')}>ask for a new one</a>.
      </Typography>
    </>
  );
}
