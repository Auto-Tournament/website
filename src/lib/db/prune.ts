import { lt, or, and, isNotNull, sql } from 'drizzle-orm';
import type { Db } from './client';
import { auditLog, invites, sessions, verificationTokens } from './schema';

/** How long the console keeps what it no longer needs (also in the privacy policy, section 4). */
export const AUDIT_RETENTION_DAYS = 2 * 365;
export const INVITE_RETENTION_DAYS = 30;

/**
 * Deletes expired sessions and sign-in links, invites 30 days after they were
 * used, withdrawn or expired, and activity log entries older than 2 years.
 * Runs at startup and then daily (src/lib/db/startup.ts).
 */
export async function pruneExpired(db: Db, now = new Date()): Promise<Record<string, number>> {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60_000);
  const inviteCutoff = daysAgo(INVITE_RETENTION_DAYS);
  const [s, v, i, a] = await Promise.all([
    db.delete(sessions).where(lt(sessions.expires, now)).returning({ x: sessions.userId }),
    db.delete(verificationTokens).where(lt(verificationTokens.expires, now)).returning({ x: verificationTokens.expires }),
    db
      .delete(invites)
      .where(
        or(
          lt(invites.expiresAt, inviteCutoff),
          and(isNotNull(invites.acceptedAt), lt(invites.acceptedAt, inviteCutoff)),
          and(isNotNull(invites.revokedAt), lt(invites.revokedAt, inviteCutoff)),
        ),
      )
      .returning({ x: invites.id }),
    db.delete(auditLog).where(lt(auditLog.at, daysAgo(AUDIT_RETENTION_DAYS))).returning({ x: sql<number>`1` }),
  ]);
  return { sessions: s.length, signInLinks: v.length, invites: i.length, auditLog: a.length };
}
