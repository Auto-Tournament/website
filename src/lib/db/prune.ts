import { lt, or, and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { Db } from './client';
import { prunePasskeyRows } from '../admin/passkeys';
import { pruneCheckins } from '../license/checkinStore';
import { auditLog, invites, leads, memberships, refundRequests, sessions, verificationTokens } from './schema';

/** How long the console keeps what it no longer needs (also in the privacy policy, section 4). */
export const AUDIT_RETENTION_DAYS = 2 * 365;
export const INVITE_RETENTION_DAYS = 30;
/** Contact form leads: 24 months after the last activity (created, or status or note changed). */
export const LEAD_RETENTION_MONTHS = 24;
/** Finished refund requests (confirmed, cancelled): the activity log keeps what happened. */
export const REFUND_REQUEST_RETENTION_DAYS = 30;

/** The moment `months` calendar months before `now` (UTC). */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/**
 * Deletes expired sessions and sign-in links, invites 30 days after they were
 * used, withdrawn or expired, activity log entries older than 2 years, and
 * contact form leads 24 months after their last activity, refund requests
 * whose confirmation link expired, and finished ones after 30 days, and
 * memberships whose access ended (server providers), each with an activity
 * log entry, and license check-ins 90 days after the instance was last seen.
 * Runs at startup and then daily (src/lib/db/startup.ts).
 */
export async function pruneExpired(db: Db, now = new Date()): Promise<Record<string, number>> {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60_000);
  const inviteCutoff = daysAgo(INVITE_RETENTION_DAYS);
  // Ended memberships first, with the activity log entry, so the audit prune below never races them.
  const ended = await db.delete(memberships).where(lt(memberships.expiresAt, now)).returning({ orgId: memberships.orgId, userId: memberships.userId, role: memberships.role });
  if (ended.length > 0) {
    await db.insert(auditLog).values(
      ended.map((m) => ({ actorUserId: null, action: 'member.expire', orgId: m.orgId, targetType: 'user', targetId: m.userId, details: { role: m.role } })),
    );
  }
  const [s, v, i, a, l, r, p, c] = await Promise.all([
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
    db.delete(leads).where(lt(leads.updatedAt, monthsBefore(now, LEAD_RETENTION_MONTHS))).returning({ x: leads.id }),
    db
      .delete(refundRequests)
      .where(
        or(
          and(eq(refundRequests.status, 'pending'), lt(refundRequests.expiresAt, now)),
          and(ne(refundRequests.status, 'pending'), lt(refundRequests.createdAt, daysAgo(REFUND_REQUEST_RETENTION_DAYS))),
        ),
      )
      .returning({ x: refundRequests.id }),
    prunePasskeyRows(db, now),
    pruneCheckins(db, now),
  ]);
  return { sessions: s.length, signInLinks: v.length, invites: i.length, auditLog: a.length, leads: l.length, refundRequests: r.length, passkeyRows: p, memberships: ended.length, licenseCheckins: c };
}
