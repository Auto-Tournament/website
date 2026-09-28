import type { Metadata } from 'next';
import { PageTitle } from '@/components/console/ConsoleShell';
import { Badge, DataTable, FilterBar, Muted } from '@/components/admin/AdminUi';
import { day, dayTime } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { listUsers } from '@/lib/admin/customers';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 120) : '';
  const users = await listUsers(db(), q);
  return (
    <>
      <PageTitle sub="Everyone with a console account. Admin comes from ADMIN_EMAILS in the server's environment, not from here.">Users</PageTitle>
      <FilterBar>
        <input type="search" name="q" defaultValue={q} placeholder="Email or name" aria-label="Search" />
        <button type="submit">Search</button>
      </FilterBar>
      <DataTable
        label="Users"
        empty="No users."
        columns={[
          { key: 'email', label: 'Email' },
          { key: 'orgs', label: 'Organizations' },
          { key: 'last', label: 'Last sign-in' },
          { key: 'created', label: 'Signed up' },
          { key: 'admin', label: 'Admin' },
        ]}
        rows={users.map((u) => ({
          key: u.id,
          cells: {
            email: (
              <>
                {u.email}
                {u.name ? <Muted> · {u.name}</Muted> : null}
                {!u.verified ? <Muted> · not verified</Muted> : null}
              </>
            ),
            orgs: u.orgs.join(', '),
            last: u.lastSignIn ? dayTime(u.lastSignIn) : <Muted>never</Muted>,
            created: day(u.createdAt),
            admin: u.isAdmin ? <Badge tone="info">Admin</Badge> : null,
          },
        }))}
      />
    </>
  );
}
