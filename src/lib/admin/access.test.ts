import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../db/testing';
import { auditLog, users } from '../db/schema';
import { adminEmails, isAdminUser, syncAdminFlag, syncAllAdmins } from './access';

let t: Awaited<ReturnType<typeof testDb>>;
beforeEach(async () => {
  t = await testDb();
});
afterEach(async () => {
  await t.close();
});

const env = (list: string) => ({ ADMIN_EMAILS: list });

async function user(email: string, verified = true, isAdmin = false) {
  const [row] = await t.db.insert(users).values({ email, emailVerified: verified ? new Date() : null, isAdmin }).returning();
  return row;
}
const flag = async (id: string) => (await t.db.select({ a: users.isAdmin }).from(users).where(eq(users.id, id)))[0].a;

describe('ADMIN_EMAILS', () => {
  it('parses a comma-separated, case-insensitive list', () => {
    expect(adminEmails(env(' Sivert@Example.com, ,other@example.com,notanemail '))).toEqual(['sivert@example.com', 'other@example.com']);
    expect(adminEmails({})).toEqual([]);
  });

  it('is admin only with the flag, a verified email, and that email still in the list', () => {
    const u = { isAdmin: true, email: 'sivert@example.com', emailVerified: new Date() };
    expect(isAdminUser(u, env('sivert@example.com'))).toBe(true);
    expect(isAdminUser(u, env('other@example.com'))).toBe(false);
    expect(isAdminUser(u, {})).toBe(false);
    expect(isAdminUser({ ...u, isAdmin: false }, env('sivert@example.com'))).toBe(false);
    expect(isAdminUser({ ...u, emailVerified: null }, env('sivert@example.com'))).toBe(false);
    expect(isAdminUser(null, env('sivert@example.com'))).toBe(false);
  });

  it('grants at sign-in for a listed, verified address, and revokes once it is removed', async () => {
    const u = await user('sivert@example.com');
    expect(await syncAdminFlag(t.db, u.id, env('SIVERT@example.com'))).toBe(true);
    expect(await flag(u.id)).toBe(true);
    expect(await syncAdminFlag(t.db, u.id, env('someone-else@example.com'))).toBe(false);
    expect(await flag(u.id)).toBe(false);
    const actions = (await t.db.select().from(auditLog)).map((a) => [a.action, a.actorUserId, a.targetId]);
    expect(actions).toEqual([
      ['admin.grant', null, u.id],
      ['admin.revoke', null, u.id],
    ]);
  });

  it('never grants an unverified address', async () => {
    const u = await user('sivert@example.com', false);
    expect(await syncAdminFlag(t.db, u.id, env('sivert@example.com'))).toBe(false);
    expect(await flag(u.id)).toBe(false);
  });

  it('syncs everyone at startup; without ADMIN_EMAILS nobody is admin', async () => {
    const a = await user('a@example.com', true, false);
    const b = await user('b@example.com', true, true);
    const c = await user('c@example.com', false, true);
    expect(await syncAllAdmins(t.db, env('a@example.com, c@example.com'))).toEqual({ granted: 1, revoked: 2 });
    expect([await flag(a.id), await flag(b.id), await flag(c.id)]).toEqual([true, false, false]);
    expect(await syncAllAdmins(t.db, {})).toEqual({ granted: 0, revoked: 1 });
    expect(await flag(a.id)).toBe(false);
  });
});
