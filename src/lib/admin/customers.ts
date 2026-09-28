/**
 * Customers for the admin CRM: organizations, users, and the audit log view.
 * Read-only; the caller checks the user is an admin.
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */
import { and, asc, desc, eq, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog, licenses, memberships, organizations, orgPendingOwners, users, type Role } from '../db/schema';
import { isUuid } from '../console/orgs';
import { fromRow, type LicenseRecord } from '../license/store';
import { line, notesFor, type Note } from './licenses';

const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export type OrgListRow = { id: string; name: string; country: string | null; members: number; licenses: number; stripeCustomerId: string | null; createdAt: Date };

export async function listAllOrgs(db: Db, rawQ?: string): Promise<OrgListRow[]> {
  const q = line(rawQ, 120);
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      country: organizations.country,
      stripeCustomerId: organizations.stripeCustomerId,
      createdAt: organizations.createdAt,
      members: sql<number>`(select count(*)::int from memberships m where m.org_id = "organizations"."id")`,
      licenses: sql<number>`(select count(*)::int from licenses l where l.org_id = "organizations"."id" and l.superseded_by is null)`,
    })
    .from(organizations)
    .where(q ? or(ilike(organizations.name, likeOf(q)), ilike(organizations.orgNumber, likeOf(q)), ilike(organizations.vatId, likeOf(q))) : undefined)
    .orderBy(asc(organizations.name))
    .limit(500);
}

export type OrgDetail = {
  org: typeof organizations.$inferSelect;
  members: { userId: string; email: string | null; name: string | null; role: Role; since: Date }[];
  licenses: LicenseRecord[];
  notes: Note[];
  /** The organization's audit log, newest first (at most 100). */
  history: { id: number; at: Date; action: string; actorEmail: string | null; actorUserId: string | null; targetType: string | null; targetId: string | null; details: Record<string, unknown> }[];
  /** Owners waiting to sign in (created from checkout); only how many, the hashes stay in the database. */
  pendingOwners: number;
};

/** One audit entry in words, for the organization's history. */
export function describeOrgEvent(e: { action: string; details: Record<string, unknown> }): string {
  const d = e.details;
  const session = typeof d.session === 'string' ? d.session : null;
  if (e.action === 'org.create' && d.via === 'checkout' && session) return `Created from checkout ${session}`;
  if (e.action === 'org.create') return 'Created in the console';
  if (e.action === 'org.pending_owner') return session ? `Owner pending: the buyer of ${session} becomes owner at sign-in` : 'Owner pending until the buyer signs in';
  if (e.action === 'member.owner_from_checkout') return session ? `Became owner as the buyer of ${session}` : 'Became owner as the buyer';
  if (e.action === 'license.issue' && d.via === 'checkout') return session ? `License added from checkout ${session}` : 'License added from checkout';
  return e.action;
}

export async function orgDetail(db: Db, orgId: string): Promise<OrgDetail | null> {
  if (!isUuid(orgId)) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return null;
  const [members, rows, notes, history, [pending]] = await Promise.all([
    db
      .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role, since: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, orgId))
      .orderBy(asc(memberships.createdAt)),
    db.select().from(licenses).where(eq(licenses.orgId, orgId)).orderBy(desc(licenses.issuedAt)),
    notesFor(db, 'organization', [orgId]),
    db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        action: auditLog.action,
        actorEmail: users.email,
        actorUserId: auditLog.actorUserId,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        details: auditLog.details,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(eq(auditLog.orgId, orgId))
      .orderBy(desc(auditLog.id))
      .limit(100),
    db.select({ n: sql<number>`count(*)::int` }).from(orgPendingOwners).where(eq(orgPendingOwners.orgId, orgId)),
  ]);
  return { org, members, licenses: rows.map(fromRow), notes, history, pendingOwners: Number(pending?.n ?? 0) };
}

export type UserRow = { id: string; email: string | null; name: string | null; isAdmin: boolean; verified: boolean; createdAt: Date; lastSignIn: Date | null; orgs: string[] };

/** Users with their organizations and last sign-in (from the audit log, which keeps 2 years). */
export async function listUsers(db: Db, rawQ?: string): Promise<UserRow[]> {
  const q = line(rawQ, 120);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isAdmin: users.isAdmin,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      // Written out with table names: drizzle leaves columns unqualified in a one-table select, which is ambiguous inside these subqueries.
      lastSignIn: sql<Date | string | null>`(select max(a.at) from audit_log a where a.actor_user_id = "users"."id" and a.action = 'auth.signin')`,
      orgs: sql<string[] | null>`(select array_agg(o.name order by o.name) from memberships m join organizations o on o.id = m.org_id where m.user_id = "users"."id")`,
    })
    .from(users)
    .where(q ? or(ilike(users.email, likeOf(q)), ilike(users.name, likeOf(q))) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    isAdmin: r.isAdmin,
    verified: r.emailVerified !== null,
    createdAt: r.createdAt,
    lastSignIn: r.lastSignIn ? new Date(r.lastSignIn) : null,
    orgs: r.orgs ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Audit log

export type AuditRow = {
  id: number;
  at: Date;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  orgId: string | null;
  orgName: string | null;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
};

export const AUDIT_PAGE = 100;

/**
 * The audit log, newest first, 100 at a time (`before`: an id from the last
 * page). `actor` matches the actor's email or user id; "system" means no
 * actor (webhook, startup). `action` is a prefix, like "license." or "admin.grant".
 */
export async function listAudit(db: Db, filters: { actor?: string; action?: string; before?: number }): Promise<{ rows: AuditRow[]; next: number | null }> {
  const where: SQL[] = [];
  const actor = line(filters.actor, 200);
  if (actor === 'system') where.push(sql`${auditLog.actorUserId} is null`);
  else if (actor) where.push(or(eq(auditLog.actorUserId, actor), ilike(users.email, likeOf(actor))) as SQL);
  const action = line(filters.action, 80);
  if (action) where.push(ilike(auditLog.action, `${action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  if (filters.before && Number.isSafeInteger(filters.before)) where.push(lt(auditLog.id, filters.before));
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      actorUserId: auditLog.actorUserId,
      actorEmail: users.email,
      orgId: auditLog.orgId,
      orgName: organizations.name,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      details: auditLog.details,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .leftJoin(organizations, eq(organizations.id, auditLog.orgId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(AUDIT_PAGE + 1);
  const more = rows.length > AUDIT_PAGE;
  const page = rows.slice(0, AUDIT_PAGE);
  return { rows: page, next: more ? page[page.length - 1].id : null };
}

/** The distinct actions in the log, for the filter's suggestions. */
export async function auditActions(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(asc(auditLog.action)).limit(200);
  return rows.map((r) => r.action);
}
