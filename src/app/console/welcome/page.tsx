import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ActionButton, OrgForm } from '@/components/console/forms';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { db } from '@/lib/db/client';
import { countryOptions } from '@/lib/console/countries';
import { invitesForUser, listOrgs, verifiedEmail } from '@/lib/console/orgs';
import { requireUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';
import { acceptInviteAction, createOrgAction } from '../actions';

export const metadata: Metadata = { title: 'Welcome' };
export const dynamic = 'force-dynamic';

const roleName = { owner: 'an owner', admin: 'an admin', member: 'a member' } as const;

// First sign-in (or any time): accept a pending invite, or create an organization.
export default async function Welcome() {
  const user = await requireUser();
  const [pending, orgs] = await Promise.all([invitesForUser(db(), user), listOrgs(db(), user.id)]);
  const verified = verifiedEmail(user);

  return (
    <>
      <PageTitle sub="Licenses, members and billing belong to an organization: the company or club that buys the licenses. If you run events for several clients, you can be in more than one.">
        {orgs.length > 0 ? 'Add an organization' : 'Welcome'}
      </PageTitle>
      {orgs.length > 0 && (
        <Typography>
          Or go back to <a href={consoleHref('/licenses')}>your licenses</a>.
        </Typography>
      )}

      {pending.length > 0 && (
        <Panel title="Invites for you">
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
            {pending.map((inv) => (
              <Box component="li" key={inv.id} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography sx={{ overflowWrap: 'anywhere' }}>
                  Join <strong>{inv.orgName}</strong> as {roleName[inv.role]}
                </Typography>
                <ActionButton action={acceptInviteAction} fields={{ inviteId: inv.id }} label="Accept" pendingLabel="Joining…" variant="contained" />
              </Box>
            ))}
          </Box>
        </Panel>
      )}

      <Panel title="Create an organization">
        <Typography sx={{ mb: 3, fontSize: '0.9375rem' }}>
          The details go on your invoices. You become its owner, and can invite others.
          {!verified && ' (Your email address is not verified yet, so invites and licenses for it show up after you sign in with an email link.)'}
        </Typography>
        <OrgForm action={createOrgAction} countries={countryOptions()} submitLabel="Create organization" />
      </Panel>
    </>
  );
}
