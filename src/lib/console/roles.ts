import type { Role } from '../db/schema';

/**
 * Role names for the console's pages. Pure: the client forms use them too.
 * A server provider sees the organization's licenses and keys, nothing else.
 */
export const roleLabel: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', provider: 'Server provider' };

/** "Join X as …". */
export const roleName: Record<Role, string> = { owner: 'an owner', admin: 'an admin', member: 'a member', provider: 'a server provider' };

export const providerNote = 'Server provider — sees licenses and keys, nothing else';

/** Everyone but a server provider sees the organization's team, billing and Buy pages. */
export const isStaff = (role: Role) => role !== 'provider';

/** The console pages a role may open inside an organization. */
export function orgPathAllowed(role: Role, path: string): boolean {
  return isStaff(role) || path === '/licenses';
}
