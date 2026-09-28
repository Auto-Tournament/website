import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { consoleHomePath } from '@/lib/console/checkoutOrg';
import { currentUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';

// The console's front door: sign in, then the admin overview for admins,
// otherwise your organization's licenses (a buyer's organization is created
// from their checkout, src/lib/console/checkoutOrg.ts) or, with no
// organization yet, the welcome page.
export const dynamic = 'force-dynamic';

export default async function ConsoleHome() {
  const user = await currentUser();
  if (!user) redirect(consoleHref('/signin'));
  redirect(consoleHref(await consoleHomePath(db(), user)));
}
