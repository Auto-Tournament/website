import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import { PageTitle } from '@/components/console/ConsoleShell';
import { DataTable, FilterBar, Muted } from '@/components/admin/AdminUi';
import { dayTime } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { auditActions, listAudit } from '@/lib/admin/customers';
import { LICENSE_ID } from '@/lib/license/verify';
import { consoleHref } from '@/lib/console/urls';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

function targetLink(type: string | null, id: string | null): React.ReactNode {
  if (!type || !id) return null;
  if (type === 'license' && LICENSE_ID.test(id)) return <a href={consoleHref(`/admin/licenses/${id}`)}>{id}</a>;
  if (type === 'organization') return <a href={consoleHref(`/admin/orgs/${id}`)}>organization</a>;
  if (type === 'lead') return <a href={consoleHref(`/admin/leads/${id}`)}>lead</a>;
  if (type === 'order') return <a href={consoleHref(`/admin/orders/${id}`)}>order</a>;
  return `${type} ${id.slice(0, 12)}`;
}

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const actor = typeof sp.actor === 'string' ? sp.actor.slice(0, 200) : '';
  const action = typeof sp.action === 'string' ? sp.action.slice(0, 80) : '';
  const before = typeof sp.before === 'string' && /^\d{1,15}$/.test(sp.before) ? Number(sp.before) : undefined;
  const [{ rows, next }, actions] = await Promise.all([listAudit(db(), { actor, action, before }), auditActions(db())]);
  const nextHref = next ? `${consoleHref('/admin/audit')}?${new URLSearchParams({ ...(actor ? { actor } : {}), ...(action ? { action } : {}), before: String(next) })}` : null;

  return (
    <>
      <PageTitle sub="Every console write and sign-in, newest first. Kept 2 years.">Audit log</PageTitle>
      <FilterBar>
        <input type="text" name="actor" defaultValue={actor} placeholder="Actor email, user id, “system” or “stripe”" aria-label="Actor" />
        <input type="text" name="action" defaultValue={action} placeholder="Action, e.g. license. or auth.signin" aria-label="Action" list="audit-actions" />
        <datalist id="audit-actions">
          {actions.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <button type="submit">Filter</button>
        <a href={consoleHref('/admin/audit')}>Clear</a>
      </FilterBar>
      <DataTable
        label="Audit log"
        empty="No entries."
        columns={[
          { key: 'at', label: 'When' },
          { key: 'actor', label: 'Actor' },
          { key: 'action', label: 'Action' },
          { key: 'target', label: 'Target' },
          { key: 'org', label: 'Organization' },
          { key: 'details', label: 'Details' },
        ]}
        rows={rows.map((r) => ({
          key: String(r.id),
          cells: {
            at: dayTime(r.at),
            actor: r.actorEmail ?? (r.actorUserId === 'stripe' ? 'stripe' : r.actorUserId ? <Muted>deleted user</Muted> : <Muted>system</Muted>),
            action: <code>{r.action}</code>,
            target: targetLink(r.targetType, r.targetId),
            org: r.orgId ? <a href={consoleHref(`/admin/orgs/${r.orgId}`)}>{r.orgName ?? 'deleted'}</a> : null,
            details: Object.keys(r.details).length > 0 ? <Box component="code" sx={{ fontSize: '0.8125rem' }}>{JSON.stringify(r.details)}</Box> : null,
          },
        }))}
      />
      {nextHref && (
        <Box sx={{ mt: 2 }}>
          <a href={nextHref}>Older entries</a>
        </Box>
      )}
    </>
  );
}
