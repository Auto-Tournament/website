import type { Db } from '../db/client';
import { auditLog } from '../db/schema';

/** A transaction or the database: audit rows go in the same transaction as the write they describe. */
export type Tx = Pick<Db, 'insert' | 'select' | 'update' | 'delete' | 'execute'>;

export type AuditEntry = {
  /** The user who did it; null for the system (the checkout webhook). */
  actor: string | null;
  action: string;
  orgId?: string | null;
  targetType?: string;
  targetId?: string;
  /** Never tokens or secrets. */
  details?: Record<string, unknown>;
};

export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: entry.actor,
    action: entry.action,
    orgId: entry.orgId ?? null,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    details: entry.details ?? {},
  });
}
