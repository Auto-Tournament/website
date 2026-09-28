import { createHash } from 'node:crypto';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { Adapter } from 'next-auth/adapters';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { accounts, sessions, users, verificationTokens } from '../db/schema';

/**
 * The Auth.js Drizzle adapter on our tables, with three changes:
 *
 * - Sessions: the database keeps a SHA-256 of the session cookie's value, not
 *   the value, so a copy of the database can't be used to sign in.
 * - Accounts: Google's access, refresh and id tokens are not stored; we only
 *   need to know which Google account belongs to which user.
 * - Email links: the token is looked up without the email address, so the
 *   link doesn't need to carry the address (src/lib/console/auth.ts).
 */
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export function consoleAdapter(db: Db): Adapter {
  const base = DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens });
  return {
    ...base,
    async createSession(session) {
      const row = await base.createSession!({ ...session, sessionToken: hash(session.sessionToken) });
      return { ...row, sessionToken: session.sessionToken };
    },
    async getSessionAndUser(sessionToken) {
      const found = await base.getSessionAndUser!(hash(sessionToken));
      return found ? { session: { ...found.session, sessionToken }, user: found.user } : null;
    },
    async updateSession(session) {
      const row = await base.updateSession!({ ...session, sessionToken: hash(session.sessionToken) });
      return row ? { ...row, sessionToken: session.sessionToken } : row;
    },
    async deleteSession(sessionToken) {
      await base.deleteSession!(hash(sessionToken));
    },
    async linkAccount(account) {
      await base.linkAccount!({ userId: account.userId, type: account.type, provider: account.provider, providerAccountId: account.providerAccountId });
    },
    async useVerificationToken({ token }) {
      const [row] = await db.delete(verificationTokens).where(eq(verificationTokens.token, token)).returning();
      return row ?? null;
    },
  };
}
