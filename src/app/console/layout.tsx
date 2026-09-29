import type { Metadata } from 'next';
import Container from '@mui/material/Container';
import { tokens } from '@/theme/tokens';
import type { NavAccount } from '@/components/nav/AccountMenu';
import { ConsoleNavBar, type ConsoleOrgSwitch } from '@/components/console/ConsoleNavBar';
import { ConsoleFooter } from '@/components/console/ConsoleFooter';
import { accountLinks } from '@/components/console/consoleNav';
import { isAdminUser } from '@/lib/admin/access';
import { currentOrg, currentUser } from '@/lib/console/session';
import { consoleBase, consoleHref, consoleOnOwnHost } from '@/lib/console/urls';
import { DEFAULT_SITE_URL, siteUrl } from '@/lib/site';
import { signOutAction, switchOrgAction } from './actions';

const { color } = tokens;

// The console (console.autotournament.gg, or /console in development): sign
// in, your organization, its licenses, members and billing. Never indexed.
export const metadata: Metadata = {
  title: { default: 'Console', template: '%s · Auto Tournament console' },
  description: 'Your Auto Tournament licenses, organization and billing.',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export const dynamic = 'force-dynamic';

/**
 * The main site's origin for links from the console: absolute on the
 * console's own host (https://autotournament.gg/pricing), '' in development
 * where the console is /console on the same host.
 */
function siteForConsole(): string {
  return consoleOnOwnHost() ? (siteUrl() ?? DEFAULT_SITE_URL) : '';
}

// The console's own frame: one navbar (src/components/console/ConsoleNavBar.tsx)
// with only console things and a way back to autotournament.gg, and a slim
// one-line footer. No site nav, no site footer, no shader behind the console
// (src/components/background/background.ts): the flat paper colour.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const site = siteForConsole();
  const base = consoleBase();
  const account: NavAccount | undefined = user
    ? { signedIn: true, email: user.email, links: accountLinks({ base, isAdmin: isAdminUser(user) }), signOut: signOutAction, home: base || '/' }
    : { signedIn: false, signIn: consoleHref('/signin') };

  // The organization switcher's data: only signed-in users with an organization have one.
  const org = user ? await currentOrg(user) : null;
  const orgSwitch: ConsoleOrgSwitch | undefined = org
    ? { orgs: org.orgs.map((o) => ({ id: o.id, name: o.name })), current: org.org.id, action: switchOrgAction }
    : undefined;

  return (
    <>
      <ConsoleNavBar base={base} account={account} org={orgSwitch} role={user ? (org?.org.role ?? null) : undefined} />
      <Container
        component="main"
        maxWidth="md"
        // The admin pages (data-admin-wide) get room for their tables on a laptop.
        sx={{ pt: { xs: 4, md: 6 }, pb: { xs: 6, md: 8 }, color: color.ink2, '& a': { color: 'inherit' }, '&:has([data-admin-wide])': { maxWidth: 1280 } }}
      >
        {children}
      </Container>
      <ConsoleFooter site={site} />
    </>
  );
}
