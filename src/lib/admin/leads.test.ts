import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../db/testing';
import { auditLog, freeLans, leads, users } from '../db/schema';
import { monthsBefore, pruneExpired } from '../db/prune';
import type { ContactRequest } from '../contact';
import { createFreeLan, createLead, getLead, leadCounts, listLeads, updateLead } from './leads';
import { AdminError } from './licenses';

let t: Awaited<ReturnType<typeof testDb>>;
let admin: { id: string };
beforeEach(async () => {
  t = await testDb();
  const [u] = await t.db.insert(users).values({ email: 'admin@example.com', emailVerified: new Date(), isAdmin: true }).returning();
  admin = { id: u.id };
});
afterEach(async () => {
  await t.close();
});

const req = (over: Partial<ContactRequest> = {}): ContactRequest => ({
  name: 'Jane Doe',
  email: 'jane@example.com',
  organization: 'Example LAN',
  topic: 'free-lan',
  numServers: '12',
  eventDates: '3–5 October 2026',
  message: 'We run a non-profit LAN.',
  ...over,
});

describe('leads', () => {
  it('stores a contact message as a new lead, lists open ones, and updates status and note with an audit entry', async () => {
    const id = await createLead(t.db, req());
    await createLead(t.db, req({ topic: 'quote', organization: '' }));
    expect((await listLeads(t.db)).length).toBe(2);
    const lead = await getLead(t.db, id);
    expect(lead).toMatchObject({ status: 'new', email: 'jane@example.com', servers: '12', topic: 'free-lan' });

    const later = new Date(Date.now() + 60_000);
    await updateLead(t.db, admin, id, { status: 'lost', note: ' Not a fit. ' }, later);
    expect(await getLead(t.db, id)).toMatchObject({ status: 'lost', note: 'Not a fit.', updatedAt: later });
    expect((await listLeads(t.db)).length).toBe(1);
    expect((await listLeads(t.db, 'lost')).map((l) => l.id)).toEqual([id]);
    expect(await leadCounts(t.db)).toEqual({ new: 1, replied: 0, won: 0, lost: 1 });
    await expect(updateLead(t.db, admin, id, { status: 'bogus', note: '' })).rejects.toThrow(AdminError);
    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'lead.update'));
    expect(entry).toMatchObject({ actorUserId: admin.id, targetId: id, details: { status: 'lost', note_changed: true } });
  });

  it('is deleted 24 months after the last activity, not before', async () => {
    const now = new Date('2026-09-28T10:00:00Z');
    const stale = await createLead(t.db, req());
    const touched = await createLead(t.db, req());
    const fresh = await createLead(t.db, req());
    // Created long ago; one of them had activity since.
    await t.db.update(leads).set({ createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-09-27T10:00:00Z') }).where(eq(leads.id, stale));
    await t.db.update(leads).set({ createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-09-29T10:00:00Z') }).where(eq(leads.id, touched));
    expect(monthsBefore(now, 24).toISOString()).toBe('2024-09-28T10:00:00.000Z');
    expect(monthsBefore(new Date('2026-03-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');

    const deleted = await pruneExpired(t.db, now);
    expect(deleted.leads).toBe(1);
    const left = (await t.db.select({ id: leads.id }).from(leads)).map((l) => l.id).sort();
    expect(left).toEqual([touched, fresh].sort());
  });
});

describe('free LAN confirmations', () => {
  it('registers one from a lead (and marks the lead won), or by hand', async () => {
    const leadId = await createLead(t.db, req());
    const id = await createFreeLan(t.db, admin, { event: 'Example LAN 2026', organizer: 'Example LAN', dates: '3–5 Oct', servers: '12', leadId }, new Date('2026-09-28T10:00:00Z'));
    const [row] = await t.db.select().from(freeLans).where(eq(freeLans.id, id));
    expect(row).toMatchObject({ event: 'Example LAN 2026', confirmedOn: '2026-09-28', leadId, createdBy: admin.id });
    expect((await getLead(t.db, leadId))?.status).toBe('won');

    await createFreeLan(t.db, admin, { event: 'Hand LAN', organizer: 'Someone', confirmedOn: '2026-08-01' });
    await expect(createFreeLan(t.db, admin, { event: '', organizer: 'x' })).rejects.toThrow(/event/);
    await expect(createFreeLan(t.db, admin, { event: 'x', organizer: 'x', confirmedOn: 'yesterday' })).rejects.toThrow(/date/);

    // Pruning the lead keeps the confirmation.
    await t.db.update(leads).set({ updatedAt: new Date('2020-01-01') }).where(eq(leads.id, leadId));
    await pruneExpired(t.db, new Date('2026-09-28T10:00:00Z'));
    const [kept] = await t.db.select().from(freeLans).where(eq(freeLans.id, id));
    expect(kept.leadId).toBeNull();
  });
});
