import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import { PageTitle } from '@/components/console/ConsoleShell';
import { Badge, DataTable, FilterBar, Muted, Progress, SectionHead, Stat } from '@/components/admin/AdminUi';
import { day, leadLabel, leadTone, money } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { endingSoon, founderStatus, revenue } from '@/lib/admin/overview';
import { listOrders } from '@/lib/admin/licenses';
import { leadCounts, listLeads } from '@/lib/admin/leads';
import { contactTopicLabel, type ContactTopic } from '@/lib/contact';
import { formatDay, kindNames, packName, todayUtc } from '@/lib/license/describe';
import { formatMoney } from '@/lib/license/sales';
import { consoleHref } from '@/lib/console/urls';
import { eurNokRate } from '@/lib/vat/rate';
import { vatThresholdNok } from '@/lib/vat/threshold';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

const nok = (n: number) => formatMoney(n, 'nok');
const eur = (n: number) => formatMoney(n, 'eur');

export default async function AdminOverview() {
  await requireAdmin();
  const now = new Date();
  const today = todayUtc(now);
  const rate = await eurNokRate();
  const [rev, founder, ending, unpaid, leads, counts] = await Promise.all([
    revenue(db(), rate.rate, now),
    founderStatus(db(), now),
    endingSoon(db(), today, 30),
    listOrders(db(), 'unpaid'),
    listLeads(db(), 'open'),
    leadCounts(db()),
  ]);
  const threshold = vatThresholdNok();
  const href = (p: string) => consoleHref(p);

  return (
    <>
      <PageTitle sub={`Live-mode sales, refunds excluded. EUR/NOK ${rate.rate.toFixed(4)}${rate.fallback ? ' (fallback rate: Norges Bank could not be reached)' : ' (Norges Bank)'}.`}>
        Overview
      </PageTitle>

      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        <Stat label="Sales, last 30 days" value={rev.last30.count} sub={`${eur(rev.last30.eur)} · ${nok(rev.last30.nok)}`} />
        <Stat label="Sales, last 12 months" value={rev.last12m.count} sub={`${eur(rev.last12m.eur)} · ${nok(rev.last12m.nok)}`} />
        <Stat label="Founder packs" value={`${founder.taken} / ${founder.limit}`} sub={founder.daysLeft > 0 ? `${founder.daysLeft} days until ${formatDay(founder.lastDay)}` : 'Sales closed'} />
        <Stat label="Open leads" value={counts.new + counts.replied} sub={`${counts.new} new · ${counts.replied} replied`} />
      </Box>

      <Box sx={{ mt: 3, display: 'grid', gap: 2.5 }}>
        <Progress
          label="VAT threshold, rolling 12 months"
          value={rev.vatNok}
          max={threshold}
          text={`${nok(rev.vatNok)} of ${nok(threshold)} (${Math.round((rev.vatNok / threshold) * 100)}%)`}
        />
        <Progress label="Founder packs sold" value={founder.taken} max={founder.limit} text={`${founder.taken} of ${founder.limit}, unpaid manual orders included`} />
      </Box>

      <SectionHead title="Ending in the next 30 days">
        <a href={href('/admin/licenses?status=current')}>All current licenses</a>
      </SectionHead>
      <DataTable
        label="Licenses ending soon"
        empty="No event or yearly license ends in the next 30 days."
        columns={[
          { key: 'ends', label: 'Ends' },
          { key: 'licensee', label: 'Licensee' },
          { key: 'pack', label: 'Pack' },
          { key: 'org', label: 'Organization' },
        ]}
        rows={ending.map((e) => ({
          key: e.record.payload.id,
          cells: {
            ends: formatDay(e.endsOn),
            licensee: <a href={href(`/admin/licenses/${e.record.payload.id}`)}>{e.record.payload.licensee ?? e.record.payload.id}</a>,
            pack: `${packName(e.record.payload)} · ${kindNames[e.record.payload.kind]}`,
            org: e.orgName,
          },
        }))}
      />

      <SectionHead title="Recent orders" />
      {unpaid.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <DataTable
            label="Unpaid manual orders"
            columns={[
              { key: 'created', label: 'Created' },
              { key: 'licensee', label: 'Unpaid order' },
              { key: 'pack', label: 'Pack' },
              { key: 'amount', label: 'Amount', align: 'right' },
            ]}
            rows={unpaid.map((o) => ({
              key: o.id,
              cells: {
                created: day(o.createdAt),
                licensee: (
                  <>
                    <a href={href(`/admin/orders/${o.id}`)}>{o.licensee}</a> <Badge tone="warn">Unpaid</Badge>
                  </>
                ),
                pack: `${packName({ product: o.product as 'servers', pack: o.pack as 'S' })} · ${kindNames[o.kind as 'event']}`,
                amount: money(o.amountTotal, o.currency),
              },
            }))}
          />
        </Box>
      )}
      <DataTable
        label="Recent paid orders"
        empty="No paid orders in the last 12 months."
        columns={[
          { key: 'date', label: 'Paid' },
          { key: 'licensee', label: 'Licensee' },
          { key: 'pack', label: 'Pack' },
          { key: 'source', label: 'Source' },
          { key: 'amount', label: 'Amount', align: 'right' },
        ]}
        rows={rev.recent.map((s) => ({
          key: s.licenseId,
          cells: {
            date: day(s.paidAt),
            licensee: <a href={href(`/admin/licenses/${s.licenseId}`)}>{s.payload.licensee ?? s.licenseId}</a>,
            pack: `${packName(s.payload)} · ${kindNames[s.payload.kind]}`,
            source: s.source === 'manual' ? 'Manual' : 'Card',
            amount: s.amountTotal ? money(s.amountTotal, s.currency) : <Muted>unknown</Muted>,
          },
        }))}
      />

      <SectionHead title="Bookkeeping export" />
      <FilterBar action={href('/admin/export/sales')} label="Export paid sales">
        <label>
          From <input type="date" name="from" defaultValue={`${today.slice(0, 4)}-01-01`} />
        </label>
        <label>
          To <input type="date" name="to" defaultValue={today} />
        </label>
        <button type="submit">Download paid sales (CSV)</button>
      </FilterBar>

      <SectionHead title="Open leads">
        <a href={href('/admin/leads')}>All leads</a>
      </SectionHead>
      <DataTable
        label="Open leads"
        empty="No open leads."
        columns={[
          { key: 'date', label: 'Received' },
          { key: 'name', label: 'From' },
          { key: 'topic', label: 'Topic' },
          { key: 'status', label: 'Status' },
        ]}
        rows={leads.slice(0, 8).map((l) => ({
          key: l.id,
          cells: {
            date: day(l.createdAt),
            name: (
              <a href={href(`/admin/leads/${l.id}`)}>
                {l.name}
                {l.organization ? ` · ${l.organization}` : ''}
              </a>
            ),
            topic: contactTopicLabel(l.topic as ContactTopic),
            status: <Badge tone={leadTone[l.status]}>{leadLabel[l.status]}</Badge>,
          },
        }))}
      />
    </>
  );
}
