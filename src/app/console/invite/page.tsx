import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { ActionButton } from '@/components/console/forms';
import { PageTitle } from '@/components/console/ConsoleShell';
import { db } from '@/lib/db/client';
import { consoleEnabled } from '@/lib/console/auth';
import { INVITE_TOKEN, inviteByToken, verifiedEmail } from '@/lib/console/orgs';
import { currentUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';
import { acceptInviteAction } from '../actions';

// Where an invite email's link lands: which organization, and an Accept
// button for the invited address. Opening it changes nothing.
export const metadata: Metadata = {
  title: 'Invite',
  // The URL carries the invite token: send only the origin onwards.
  referrer: 'strict-origin',
};

export const dynamic = 'force-dynamic';

const roleName = { owner: 'an owner', admin: 'an admin', member: 'a member' } as const;

export default async function Invite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' && INVITE_TOKEN.test(raw) ? raw : null;
  const invite = token && consoleEnabled() ? await inviteByToken(db(), token).catch(() => null) : null;
  const user = invite ? await currentUser() : null;

  if (!token || !invite) {
    return (
      <>
        <PageTitle>Invite</PageTitle>
        <Typography>This invite link isn&apos;t valid. Ask the person who invited you for a new one.</Typography>
      </>
    );
  }

  return (
    <>
      <PageTitle>Join {invite.orgName}</PageTitle>
      {invite.status === 'used' && <Typography>This invite was already used or withdrawn. Ask for a new one if you still need access.</Typography>}
      {invite.status === 'expired' && <Typography>This invite has expired (invites last 7 days). Ask for a new one.</Typography>}
      {invite.status === 'pending' && !user && (
        <Box sx={{ display: 'grid', gap: 2, justifyItems: 'start' }}>
          <Typography>
            You&apos;re invited to join <strong>{invite.orgName}</strong> as {roleName[invite.role]}. Sign in with <strong>{invite.email}</strong> to accept: the invite
            is waiting for you there.
          </Typography>
          <Button variant="contained" href={consoleHref('/signin')}>
            Sign in
          </Button>
        </Box>
      )}
      {invite.status === 'pending' && user && verifiedEmail(user) !== invite.email && (
        <Typography>
          This invite is for <strong>{invite.email}</strong>, and you&apos;re signed in as {user.email ?? 'someone else'}
          {user.email && !user.emailVerified ? ' (not verified yet)' : ''}. Sign out, then sign in with the invited address.
        </Typography>
      )}
      {invite.status === 'pending' && user && verifiedEmail(user) === invite.email && (
        <Box sx={{ display: 'grid', gap: 2, justifyItems: 'start' }}>
          <Typography>
            Join <strong>{invite.orgName}</strong> as {roleName[invite.role]}. Members see the organization&apos;s licenses and keys.
          </Typography>
          <ActionButton action={acceptInviteAction} fields={{ token }} label="Accept invite" pendingLabel="Joining…" variant="contained" size="medium" />
        </Box>
      )}
    </>
  );
}
