import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { ConsoleSubNav } from '@/components/console/ConsoleSubNav';
import { OrgSwitcher } from '@/components/console/forms';
import { requireOrg } from '@/lib/console/session';
import { consoleBase } from '@/lib/console/urls';
import { switchOrgAction } from '../actions';

const { color } = tokens;

export const dynamic = 'force-dynamic';

// Pages inside an organization: its sections in the sub-nav, with the switcher
// (when you're in more than one) or its name at the row's end. "Add an
// organization" is in the account menu.
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const { org, orgs } = await requireOrg();
  return (
    <>
      <ConsoleSubNav
        area="org"
        base={consoleBase()}
        aside={
          orgs.length > 1 ? (
            <OrgSwitcher action={switchOrgAction} orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} current={org.id} />
          ) : (
            <Box data-testid="org-name" sx={{ color: color.ink, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>
              {org.name}
            </Box>
          )
        }
      />
      {children}
    </>
  );
}
