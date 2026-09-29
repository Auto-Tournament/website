import type { Metadata } from 'next';
import Container from '@mui/material/Container';
import { tokens } from '@/theme/tokens';
import { SiteNav } from '@/components/nav/SiteNav';
import type { NavAccount } from '@/components/nav/AccountMenu';
import { Footer } from '@/components/Footer';
import { accountLinks } from '@/components/console/consoleNav';
import { isAdminUser } from '@/lib/admin/access';
import { currentUser } from '@/lib/console/session';
import { consoleBase, consoleHref, consoleOnOwnHost } from '@/lib/console/urls';
import { DEFAULT_SITE_URL, siteUrl } from '@/lib/site';
import { signOutAction } from './actions';

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

// The site's own nav and footer, so the rest of the site is always a click
// away; the account menu takes the Console entry's place. No shader behind the
// console (src/components/background/background.ts): the flat paper colour.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const site = siteForConsole();
  const account: NavAccount = user
    ? { signedIn: true, email: user.email, links: accountLinks({ base: consoleBase(), isAdmin: isAdminUser(user) }), signOut: signOutAction }
    : { signedIn: false, signIn: consoleHref('/signin') };
  return (
    <>
      <SiteNav site={site} account={account} />
      <Container
        component="main"
        maxWidth="md"
        // The admin pages (data-admin-wide) get room for their tables on a laptop.
        sx={{ pt: { xs: 4, md: 6 }, pb: { xs: 6, md: 8 }, color: color.ink2, '& a': { color: 'inherit' }, '&:has([data-admin-wide])': { maxWidth: 1280 } }}
      >
        {children}
      </Container>
      <Footer site={site} consoleHome={consoleHref('/')} />
    </>
  );
}
