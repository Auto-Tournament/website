import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { roleName } from '@/lib/console/roles';
import { ActionButton } from '@/components/console/forms';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { db } from '@/lib/db/client';
import { invitesForUser, listOrgs, verifiedEmail } from '@/lib/console/orgs';
import { requireUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';
import { acceptInviteAction } from '../actions';

export const metadata: Metadata = { title: 'Welcome' };
export const dynamic = 'force-dynamic';

// Signed in with no organization: there is nothing to create here.
// Organizations come from checkout (src/lib/console/checkoutOrg.ts) or an
// admin, so this page points at the Buy page (which works without one:
// checkout makes the organization), and lists any invites.
export default async function Welcome() {
  const user = await requireUser();
  const [pending, orgs] = await Promise.all([invitesForUser(db(), user), listOrgs(db(), user.id)]);
  if (orgs.length > 0 && pending.length === 0) redirect(consoleHref('/licenses'));
  const verified = verifiedEmail(user);

  return (
    <>
      <PageTitle sub="Buy a license and your organization is set up for you.">Welcome</PageTitle>
      {orgs.length === 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
          <Button variant="contained" href={consoleHref('/buy')} data-testid="welcome-buy">
            Buy a license
          </Button>
          {!verified && (
            <Typography sx={{ fontSize: '0.9375rem' }}>
              Bought one already? Sign in with an email link to the address you paid with, and it shows up here.
            </Typography>
          )}
        </Box>
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

      {orgs.length > 0 && (
        <Typography sx={{ mt: 3 }}>
          Or go back to <a href={consoleHref('/licenses')}>your licenses</a>.
        </Typography>
      )}
    </>
  );
}
