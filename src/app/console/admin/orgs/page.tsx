import type { Metadata } from 'next';
import { PageTitle } from '@/components/console/ConsoleShell';
import { DataTable, FilterBar } from '@/components/admin/AdminUi';
import { day } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { listAllOrgs } from '@/lib/admin/customers';
import { consoleHref } from '@/lib/console/urls';

export const metadata: Metadata = { title: 'Organizations' };
export const dynamic = 'force-dynamic';

export default async function AdminOrgs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 120) : '';
  const orgs = await listAllOrgs(db(), q);
  return (
    <>
      <PageTitle sub={`${orgs.length} ${orgs.length === 1 ? 'organization' : 'organizations'}.`}>Organizations</PageTitle>
      <FilterBar>
        <input type="search" name="q" defaultValue={q} placeholder="Name, org number or VAT ID" aria-label="Search" />
        <button type="submit">Search</button>
      </FilterBar>
      <DataTable
        label="Organizations"
        empty="No organizations."
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'country', label: 'Country' },
          { key: 'members', label: 'Members', align: 'right' },
          { key: 'licenses', label: 'Licenses', align: 'right' },
          { key: 'stripe', label: 'Stripe customer' },
          { key: 'created', label: 'Created' },
        ]}
        rows={orgs.map((o) => ({
          key: o.id,
          cells: {
            name: <a href={consoleHref(`/admin/orgs/${o.id}`)}>{o.name}</a>,
            country: o.country,
            members: String(o.members),
            licenses: String(o.licenses),
            stripe: o.stripeCustomerId,
            created: day(o.createdAt),
          },
        }))}
      />
    </>
  );
}
