/**
 * Who is an admin (Auto Tournament staff, the /admin CRM). The ADMIN_EMAILS
 * env (comma-separated) is the source: a user whose verified email is in it
 * gets users.is_admin at sign-in and at startup, and loses it when the address
 * leaves the list. Every admin page, action and route also checks the list
 * again (isAdminUser), so removing an address takes effect at once, even for
 * a session that is already open. Without ADMIN_EMAILS nobody is admin.
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */
import { and, eq, inArray, isNotNull, not, or, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { audit } from '../console/audit';

type Env = Record<string, string | undefined>;

/** The lowercased addresses in ADMIN_EMAILS. */
export function adminEmails(env: Env = process.env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

export type MaybeAdmin = { isAdmin: boolean; email: string | null; emailVerified: Date | null };

/** An admin right now: the database flag, a verified email, and that email still in ADMIN_EMAILS. */
export function isAdminUser(user: MaybeAdmin | null | undefined, env: Env = process.env): boolean {
  if (!user?.isAdmin || !user.emailVerified || !user.email) return false;
  return adminEmails(env).includes(user.email.trim().toLowerCase());
}

/** Brings one user's is_admin in line with ADMIN_EMAILS (at sign-in). Returns the new value. */
export async function syncAdminFlag(db: Db, userId: string, env: Env = process.env): Promise<boolean> {
  const [row] = await db.select({ email: users.email, emailVerified: users.emailVerified, isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return false;
  const should = Boolean(row.emailVerified && row.email && adminEmails(env).includes(row.email.toLowerCase()));
  if (should !== row.isAdmin) {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ isAdmin: should }).where(eq(users.id, userId));
      await audit(tx, { actor: null, action: should ? 'admin.grant' : 'admin.revoke', targetType: 'user', targetId: userId, details: { via: 'ADMIN_EMAILS' } });
    });
  }
  return should;
}

/** Brings every user's is_admin in line with ADMIN_EMAILS (at startup). Returns how many changed. */
export async function syncAllAdmins(db: Db, env: Env = process.env): Promise<{ granted: number; revoked: number }> {
  const list = adminEmails(env);
  return db.transaction(async (tx) => {
    const listed = list.length > 0 ? inArray(sql`lower(${users.email})`, list) : sql`false`;
    const revoked = await tx
      .update(users)
      .set({ isAdmin: false })
      .where(and(eq(users.isAdmin, true), or(not(listed), isNull(users.emailVerified))))
      .returning({ id: users.id });
    const granted = await tx
      .update(users)
      .set({ isAdmin: true })
      .where(and(eq(users.isAdmin, false), listed, isNotNull(users.emailVerified)))
      .returning({ id: users.id });
    for (const r of revoked) await audit(tx, { actor: null, action: 'admin.revoke', targetType: 'user', targetId: r.id, details: { via: 'ADMIN_EMAILS' } });
    for (const g of granted) await audit(tx, { actor: null, action: 'admin.grant', targetType: 'user', targetId: g.id, details: { via: 'ADMIN_EMAILS' } });
    return { granted: granted.length, revoked: revoked.length };
  });
}
