import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { listOrgs } from '@/lib/console/orgs';
import { currentUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';

// The console's front door: sign in, then the admin overview for admins,
// otherwise your organization's licenses (or, with no organization yet, the
// welcome page).
export const dynamic = 'force-dynamic';

export default async function ConsoleHome() {
  const user = await currentUser();
  if (!user) redirect(consoleHref('/signin'));
  if (user.isAdmin) redirect(consoleHref('/admin'));
  const orgs = await listOrgs(db(), user.id);
  redirect(consoleHref(orgs.length > 0 ? '/licenses' : '/welcome'));
}
