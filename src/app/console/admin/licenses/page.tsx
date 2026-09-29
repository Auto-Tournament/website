import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import { PageTitle } from '@/components/console/ConsoleShell';
import { Badge, DataTable, FilterBar, Muted, SectionHead } from '@/components/admin/AdminUi';
import { day, money, statusTone } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminStatusLabel, endsOn, LIST_LIMIT, listLicenses, listOrders, type AdminStatus } from '@/lib/admin/licenses';
import { formatDay, kindNames, packName, todayUtc } from '@/lib/license/describe';
import { consoleHref } from '@/lib/console/urls';
import { usageForLicenses } from '@/lib/license/checkinStore';
import type { Usage } from '@/lib/license/checkin';

export const metadata: Metadata = { title: 'Licenses' };
export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.slice(0, 120) : '');

const statuses: (AdminStatus | 'current')[] = ['current', 'active', 'upcoming', 'expired', 'updates-ended', 'replaced', 'refunded', 'revoked', 'test'];

/** Instances and servers from the check-ins, with the overuse flag. */
function usageCell(u: Usage | undefined) {
  if (!u || u.instances.length === 0) return null;
  const text = `${u.instances.length} inst. · ${u.windowServers} srv`;
  if (u.overServers) return <Badge tone="bad">Overuse · {text}</Badge>;
  if (u.outsideDates) return <Badge tone={u.fullEventOutside ? 'bad' : 'warn'}>Outside dates · {text}</Badge>;
  return <Muted>{text}</Muted>;
}

export default async function AdminLicenses({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = { q: one(sp.q), status: one(sp.status) as AdminStatus | 'current' | '', kind: one(sp.kind), product: one(sp.product), source: one(sp.source) };
  const today = todayUtc();
  const [{ rows, more }, unpaid] = await Promise.all([listLicenses(db(), filters, today), listOrders(db(), 'unpaid')]);
  const usage = await usageForLicenses(db(), rows.map((r) => r.record.payload));
  const href = (p: string) => consoleHref(p);

  return (
    <>
      <PageTitle sub={`${rows.length}${more ? '+' : ''} ${rows.length === 1 ? 'license' : 'licenses'}, newest first.`}>Licenses</PageTitle>

      <FilterBar>
        <input type="search" name="q" defaultValue={filters.q} placeholder="Licensee, license id, order ref, invoice, org" aria-label="Search" />
        <select name="status" defaultValue={filters.status} aria-label="Status">
          <option value="">Any status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s === 'current' ? 'Current (not replaced, refunded or test)' : adminStatusLabel[s]}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue={filters.kind} aria-label="Kind">
          <option value="">Any kind</option>
          <option value="event">Per event</option>
          <option value="year">Yearly</option>
          <option value="founder">Founder</option>
        </select>
        <select name="product" defaultValue={filters.product} aria-label="Product">
          <option value="">Any product</option>
          <option value="servers">Servers</option>
          <option value="platform">Platform</option>
        </select>
        <select name="source" defaultValue={filters.source} aria-label="Source">
          <option value="">Card and manual</option>
          <option value="stripe">Card (Stripe)</option>
          <option value="manual">Manual</option>
        </select>
        <button type="submit">Filter</button>
        <a href={href('/admin/licenses')}>Clear</a>
      </FilterBar>

      {unpaid.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <SectionHead title="Unpaid manual orders" />
          <DataTable
            label="Unpaid manual orders"
            columns={[
              { key: 'licensee', label: 'Licensee' },
              { key: 'pack', label: 'Pack' },
              { key: 'org', label: 'Organization' },
              { key: 'ref', label: 'Payment ref' },
              { key: 'amount', label: 'Amount', align: 'right' },
              { key: 'created', label: 'Created' },
            ]}
            rows={unpaid.map((o) => ({
              key: o.id,
              cells: {
                licensee: <a href={href(`/admin/orders/${o.id}`)}>{o.licensee}</a>,
                pack: `${packName({ product: o.product as 'servers', pack: o.pack as 'S' })} · ${kindNames[o.kind as 'event']}`,
                org: o.orgName,
                ref: o.paymentRef,
                amount: money(o.amountTotal, o.currency),
                created: day(o.createdAt),
              },
            }))}
          />
        </Box>
      )}

      <DataTable
        label="Licenses"
        empty="No license matches."
        columns={[
          { key: 'licensee', label: 'Licensee' },
          { key: 'pack', label: 'Pack' },
          { key: 'status', label: 'Status' },
          { key: 'usage', label: 'In use' },
          { key: 'dates', label: 'Issued / ends' },
          { key: 'org', label: 'Organization' },
          { key: 'amount', label: 'Amount', align: 'right' },
          { key: 'founder', label: 'Founder #' },
        ]}
        rows={rows.map(({ record: r, status, orgId, orgName, founderNumber }) => {
          const ends = endsOn(r.payload);
          return {
            key: r.payload.id,
            cells: {
              licensee: (
                <Box sx={{ display: 'grid' }}>
                  <a href={href(`/admin/licenses/${r.payload.id}`)}>{r.payload.licensee ?? 'No licensee'}</a>
                  <Muted>
                    {r.payload.id}
                    {r.source === 'manual' ? ' · manual' : ''}
                  </Muted>
                </Box>
              ),
              pack: `${packName(r.payload)} · ${kindNames[r.payload.kind]}`,
              status: <Badge tone={statusTone[status]}>{adminStatusLabel[status]}</Badge>,
              usage: usageCell(usage.get(r.payload.id)),
              dates: (
                <>
                  {day(r.payload.issued_at)}
                  {ends ? <Muted> → {formatDay(ends)}</Muted> : <Muted> → for life</Muted>}
                </>
              ),
              org: orgId ? <a href={href(`/admin/orgs/${orgId}`)}>{orgName}</a> : null,
              amount: money(r.amount_total, r.currency),
              founder: founderNumber ? `#${founderNumber}` : null,
            },
          };
        })}
      />
      {more && <Box sx={{ mt: 1.5 }}><Muted>Showing the newest {LIST_LIMIT}. Narrow the search to see older ones.</Muted></Box>}
    </>
  );
}
