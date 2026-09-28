import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { auth, consoleEnabled } from './auth';
import { getOrg, listOrgs, type ConsoleUser, type Org, type OrgSummary } from './orgs';
import type { Role } from '@/lib/db/schema';
import { consoleHref, consoleOrigin } from './urls';

/** The signed-in user, or null (also when the console is off or the database can't be reached). Once per request. */
export const currentUser = cache(async (): Promise<ConsoleUser | null> => {
  if (!consoleEnabled()) return null;
  try {
    const session = await auth();
    const u = session?.user;
    if (!u?.id) return null;
    const verified = u.emailVerified ? new Date(u.emailVerified) : null;
    return { id: u.id, email: u.email ?? null, emailVerified: verified, name: u.name ?? null, isAdmin: u.isAdmin === true };
  } catch (err) {
    console.error('[console] could not read the session', err instanceof Error ? err.name : 'unknown error');
    return null;
  }
});

export async function requireUser(): Promise<ConsoleUser> {
  const user = await currentUser();
  if (!user) redirect(consoleHref('/signin'));
  return user;
}

/** Which organization the console shows: a cookie with its id. Only a hint: membership is checked on every read. */
export function orgCookieName(): string {
  return consoleOrigin().startsWith('https://') ? '__Host-at-org' : 'at-org';
}

export async function setCurrentOrg(orgId: string): Promise<void> {
  (await cookies()).set(orgCookieName(), orgId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: consoleOrigin().startsWith('https://'),
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
}

export type CurrentOrg = { org: Org & { role: Role }; orgs: OrgSummary[] };

/** The organization chosen in the switcher (or the first), with every organization the user is in. Null when they have none. */
export async function currentOrg(user: ConsoleUser): Promise<CurrentOrg | null> {
  const orgs = await listOrgs(db(), user.id);
  if (orgs.length === 0) return null;
  const wanted = (await cookies()).get(orgCookieName())?.value;
  const pick = orgs.find((o) => o.id === wanted) ?? orgs[0];
  const org = await getOrg(db(), user.id, pick.id);
  return org ? { org, orgs } : null;
}

/** For pages inside an organization: the user and org, or off to sign-in / the welcome page. */
export async function requireOrg(): Promise<{ user: ConsoleUser } & CurrentOrg> {
  const user = await requireUser();
  const current = await currentOrg(user);
  if (!current) redirect(consoleHref('/welcome'));
  return { user, ...current };
}
