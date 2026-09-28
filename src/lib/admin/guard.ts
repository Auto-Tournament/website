import 'server-only';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/console/session';
import type { ConsoleUser } from '@/lib/console/orgs';
import { isAdminUser } from './access';

/**
 * The admin check for every /admin page and route: the signed-in user when
 * they are an admin (src/lib/admin/access.ts), otherwise a 404, so the admin
 * area looks like it isn't there. Server actions use adminWriter in
 * src/app/console/admin/actions.ts, which checks the same.
 */
export async function requireAdmin(): Promise<ConsoleUser> {
  const user = await currentUser();
  if (!user || !isAdminUser(user)) notFound();
  return user;
}

/** The signed-in admin, or null. */
export async function currentAdmin(): Promise<ConsoleUser | null> {
  const user = await currentUser();
  return user && isAdminUser(user) ? user : null;
}
