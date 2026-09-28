import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { ConsoleTabs } from '@/components/console/ConsoleNav';
import { OrgSwitcher } from '@/components/console/forms';
import { requireOrg } from '@/lib/console/session';
import { consoleBase, consoleHref } from '@/lib/console/urls';
import { switchOrgAction } from '../actions';

const { color } = tokens;

export const dynamic = 'force-dynamic';

// Pages inside an organization: the switcher (when you're in more than one) and the sections.
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const { org, orgs } = await requireOrg();
  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 5 }}>
        {orgs.length > 1 ? (
          <OrgSwitcher action={switchOrgAction} orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} current={org.id} />
        ) : (
          <Box data-testid="org-name" sx={{ color: color.ink, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>
            {org.name}
          </Box>
        )}
        <Box component="a" href={consoleHref('/welcome')} sx={{ fontSize: '0.875rem', color: `${color.muted} !important` }}>
          Add an organization
        </Box>
      </Box>
      <ConsoleTabs base={consoleBase()} />
      <Box sx={{ mt: 4 }}>{children}</Box>
    </>
  );
}
