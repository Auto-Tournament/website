import type { Metadata } from 'next';
import { PageTitle } from '@/components/console/ConsoleShell';
import { Badge, DataTable, FilterBar, Muted } from '@/components/admin/AdminUi';
import { day, leadLabel, leadTone } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { isLeadStatus, leadCounts, listLeads } from '@/lib/admin/leads';
import { contactTopicLabel, type ContactTopic } from '@/lib/contact';
import { LEAD_STATUSES } from '@/lib/db/schema';
import { consoleHref } from '@/lib/console/urls';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

export default async function AdminLeads({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const raw = typeof sp.status === 'string' ? sp.status : 'open';
  const status = raw === 'all' || isLeadStatus(raw) ? raw : 'open';
  const [leads, counts] = await Promise.all([listLeads(db(), status), leadCounts(db())]);
  return (
    <>
      <PageTitle sub={`Messages from the contact form. ${counts.new} new, ${counts.replied} replied, ${counts.won} won, ${counts.lost} lost. Deleted 24 months after the last activity.`}>
        Leads
      </PageTitle>
      <FilterBar>
        <select name="status" defaultValue={status} aria-label="Status">
          <option value="open">Open (new and replied)</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {leadLabel[s]}
            </option>
          ))}
          <option value="all">All</option>
        </select>
        <button type="submit">Show</button>
      </FilterBar>
      <DataTable
        label="Leads"
        empty="No leads here."
        columns={[
          { key: 'date', label: 'Received' },
          { key: 'from', label: 'From' },
          { key: 'topic', label: 'Topic' },
          { key: 'details', label: 'Servers / dates' },
          { key: 'status', label: 'Status' },
        ]}
        rows={leads.map((l) => ({
          key: l.id,
          cells: {
            date: day(l.createdAt),
            from: (
              <>
                <a href={consoleHref(`/admin/leads/${l.id}`)}>{l.name}</a>
                {l.organization ? <Muted> · {l.organization}</Muted> : null}
              </>
            ),
            topic: contactTopicLabel(l.topic as ContactTopic),
            details: [l.servers, l.eventDates].filter(Boolean).join(' · '),
            status: <Badge tone={leadTone[l.status]}>{leadLabel[l.status]}</Badge>,
          },
        }))}
      />
    </>
  );
}
