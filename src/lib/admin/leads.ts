/**
 * Leads (/contact submissions, kept next to the email they send) and the
 * free LAN confirmation register. The admin functions assume the caller
 * checked the user is an admin (src/lib/admin/guard.ts); their writes go into
 * audit_log with the admin as the actor. Leads are deleted 24 months after
 * their last activity (src/lib/db/prune.ts).
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { freeLans, leads, LEAD_STATUSES, type LeadStatus } from '../db/schema';
import { audit } from '../console/audit';
import { isUuid } from '../console/orgs';
import type { ContactRequest } from '../contact';
import { AdminError, isDay, line, textBlock, type Actor } from './licenses';

export type Lead = typeof leads.$inferSelect;
export type FreeLan = typeof freeLans.$inferSelect;

export const isLeadStatus = (v: unknown): v is LeadStatus => typeof v === 'string' && (LEAD_STATUSES as readonly string[]).includes(v);
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ['new', 'replied'];

/** Stores a /contact submission (already validated by validateContactRequest). */
export async function createLead(db: Db, req: ContactRequest): Promise<string> {
  const [row] = await db
    .insert(leads)
    .values({
      name: req.name,
      email: req.email,
      organization: req.organization || null,
      topic: req.topic,
      servers: req.numServers || null,
      eventDates: req.eventDates || null,
      message: req.message,
    })
    .returning({ id: leads.id });
  return row.id;
}

export async function listLeads(db: Db, status: LeadStatus | 'open' | 'all' = 'open'): Promise<Lead[]> {
  const where = status === 'all' ? undefined : status === 'open' ? inArray(leads.status, [...OPEN_LEAD_STATUSES]) : eq(leads.status, status);
  return db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(500);
}

export async function getLead(db: Db, id: string): Promise<Lead | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return row ?? null;
}

/** Sets a lead's status and note. Counts as activity: the 24-month retention starts again. */
export async function updateLead(db: Db, actor: Actor, id: string, input: { status: string; note: string }, now = new Date()): Promise<void> {
  if (!isUuid(id)) throw new AdminError('No such lead.');
  if (!isLeadStatus(input.status)) throw new AdminError('Choose a status.');
  const note = textBlock(input.note);
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ status: leads.status, note: leads.note }).from(leads).where(eq(leads.id, id)).limit(1);
    if (!before) throw new AdminError('No such lead.');
    await tx.update(leads).set({ status: input.status as LeadStatus, note, updatedAt: now }).where(eq(leads.id, id));
    await audit(tx, {
      actor: actor.id,
      action: 'lead.update',
      targetType: 'lead',
      targetId: id,
      details: { ...(before.status !== input.status ? { status: input.status } : {}), note_changed: (before.note ?? null) !== note },
    });
  });
}

export async function leadCounts(db: Db): Promise<Record<LeadStatus, number>> {
  const rows = await db.select({ status: leads.status, n: sql<number>`count(*)::int` }).from(leads).groupBy(leads.status);
  const out = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const r of rows) if (isLeadStatus(r.status)) out[r.status] = Number(r.n);
  return out;
}

// ---------------------------------------------------------------------------
// Free LAN confirmations

export type FreeLanInput = Record<string, string | undefined>;

export async function createFreeLan(db: Db, actor: Actor, raw: FreeLanInput, now = new Date()): Promise<string> {
  const event = line(raw.event, 200);
  const organizer = line(raw.organizer, 200);
  const confirmedOn = (raw.confirmedOn ?? '').trim() || now.toISOString().slice(0, 10);
  if (!event) throw new AdminError('Enter the event.');
  if (!organizer) throw new AdminError('Enter the organizer.');
  if (!isDay(confirmedOn)) throw new AdminError('The confirmation date must be a date (YYYY-MM-DD).');
  const leadId = raw.leadId && isUuid(raw.leadId) ? raw.leadId : null;
  return db.transaction(async (tx) => {
    if (leadId) {
      const [lead] = await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) throw new AdminError('No such lead.');
      // Confirming is activity on the lead, and usually the answer to it.
      await tx.update(leads).set({ status: 'won', updatedAt: now }).where(and(eq(leads.id, leadId), inArray(leads.status, [...OPEN_LEAD_STATUSES])));
    }
    const [row] = await tx
      .insert(freeLans)
      .values({ event, organizer, dates: line(raw.dates, 200), servers: line(raw.servers, 100), confirmedOn, note: textBlock(raw.note), leadId, createdBy: actor.id })
      .returning({ id: freeLans.id });
    await audit(tx, { actor: actor.id, action: 'free_lan.create', targetType: 'free_lan', targetId: row.id, details: leadId ? { lead: leadId } : {} });
    return row.id;
  });
}

export async function listFreeLans(db: Db): Promise<FreeLan[]> {
  return db.select().from(freeLans).orderBy(desc(freeLans.confirmedOn), desc(freeLans.createdAt)).limit(500);
}
