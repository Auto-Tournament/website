import type { Metadata } from 'next';
import { ConsoleShell } from '@/components/console/ConsoleShell';
import { currentUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';
import { DEFAULT_SITE_URL, siteUrl } from '@/lib/site';
import { signOutAction } from './actions';

// The console (console.autotournament.gg, or /console in development): sign
// in, your organization, its licenses, members and billing. Never indexed.
export const metadata: Metadata = {
  title: { default: 'Console', template: '%s · Auto Tournament console' },
  description: 'Your Auto Tournament licenses, organization and billing.',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <ConsoleShell
      home={consoleHref('/')}
      site={siteUrl() ?? DEFAULT_SITE_URL}
      email={user?.email}
      signOut={user ? signOutAction : undefined}
    >
      {children}
    </ConsoleShell>
  );
}
