import type { Metadata } from 'next';
import Typography from '@mui/material/Typography';
import { PageTitle } from '@/components/console/ConsoleShell';
import { PasskeyAdd } from '@/components/admin/Passkeys';
import { db } from '@/lib/db/client';
import { isAdminUser } from '@/lib/admin/access';
import { linkByToken, PASSKEY_TOKEN } from '@/lib/admin/passkeys';
import { consoleEnabled } from '@/lib/console/auth';
import { currentUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';

// Where the "add a passkey" link (emailed to an admin's own address) lands.
// Opening it changes nothing; the button runs the passkey ceremony, and the
// server checks the link, the signed-in admin and the challenge again.
export const metadata: Metadata = {
  title: 'Add a passkey',
  // The URL carries the token: send nothing onwards.
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function AddPasskey({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' && PASSKEY_TOKEN.test(raw) ? raw : null;
  const link = token && consoleEnabled() ? await linkByToken(db(), token).catch(() => null) : null;
  const user = await currentUser();
  // Registering uses the link up, and the page re-renders right after: tell the admin who just used it that it worked.
  const justAdded = Boolean(link?.usedAt && user && user.id === link.userId && Date.now() - link.usedAt.getTime() < 15 * 60_000);
  const invalid = !token || !link || link.usedAt || link.expiresAt.getTime() <= Date.now();
  return (
    <>
      <PageTitle>Add a passkey</PageTitle>
      {justAdded ? (
        <Typography>
          Your passkey is added. <a href={consoleHref('/admin')}>Go to the admin area</a>
        </Typography>
      ) : invalid ? (
        <Typography>This link isn&apos;t valid, was already used or has expired. Ask for a new one on the admin page.</Typography>
      ) : !user || !isAdminUser(user) || user.id !== link.userId ? (
        <Typography>
          Sign in to the console as the admin this link was sent to, then open it again. {!user && <a href={consoleHref('/signin')}>Sign in</a>}
        </Typography>
      ) : (
        <PasskeyAdd token={token} recovery={link.purpose === 'recover'} />
      )}
    </>
  );
}
