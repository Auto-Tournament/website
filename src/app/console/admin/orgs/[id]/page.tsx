import type { Metadata } from 'next';
import { roleLabel } from '@/lib/console/roles';
import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { tokens } from '@/theme/tokens';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { DetailList } from '@/components/LicenseKeyView';
import { AdminForm } from '@/components/admin/AdminClient';
import { Badge, DataTable, Muted } from '@/components/admin/AdminUi';
import { day, dayTime, money, statusTone } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { describeOrgEvent, orgDetail } from '@/lib/admin/customers';
import { adminStatus, adminStatusLabel } from '@/lib/admin/licenses';
import { countryName } from '@/lib/console/countries';
import { kindNames, packName, todayUtc } from '@/lib/license/describe';
import { consoleHref } from '@/lib/console/urls';
import { addOrgNoteAction } from '../../actions';

const { color } = tokens;

export const metadata: Metadata = { title: 'Organization' };
export const dynamic = 'force-dynamic';


export default async function AdminOrg({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const detail = await orgDetail(db(), (await params).id);
  if (!detail) notFound();
  const { org, members, licenses, notes, history, pendingOwners } = detail;
  const today = todayUtc();
  const stripeBase = 'https://dashboard.stripe.com';
  const address = [org.addressLine1, org.addressLine2, [org.postalCode, org.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <>
      <PageTitle sub={`Created ${day(org.createdAt)}.`}>{org.name}</PageTitle>
      <DetailList
        rows={[
          ['Organization number', org.orgNumber ?? '—'],
          ['VAT ID', org.vatId ?? '—'],
          ['Country', org.country ? countryName(org.country) : '—'],
          ['Billing address', address || '—'],
          [
            'Stripe customer',
            org.stripeCustomerId ? (
              <a key="s" href={`${stripeBase}/customers/${org.stripeCustomerId}`} target="_blank" rel="noopener noreferrer">
                {org.stripeCustomerId} ↗
              </a>
            ) : (
              'None yet'
            ),
          ],
        ]}
      />

      <Panel title={`Members (${members.length})`}>
        {pendingOwners > 0 && (
          <Box data-testid="pending-owners" sx={{ mb: 2 }}>
            <Muted>
              {pendingOwners === 1 ? 'The buyer becomes owner' : `${pendingOwners} buyers become owners`} on first sign-in with the email paid with.
            </Muted>
          </Box>
        )}
        <DataTable
          label="Members"
          empty="No members."
          columns={[
            { key: 'who', label: 'Member' },
            { key: 'role', label: 'Role' },
            { key: 'since', label: 'Since' },
          ]}
          rows={members.map((m) => ({ key: m.userId, cells: { who: m.name ? `${m.name} · ${m.email}` : m.email, role: roleLabel[m.role], since: day(m.since) } }))}
        />
      </Panel>

      <Panel title={`Licenses (${licenses.length})`}>
        <DataTable
          label="Licenses"
          empty="No licenses."
          columns={[
            { key: 'license', label: 'License' },
            { key: 'pack', label: 'Pack' },
            { key: 'status', label: 'Status' },
            { key: 'issued', label: 'Issued' },
            { key: 'amount', label: 'Amount', align: 'right' },
          ]}
          rows={licenses.map((r) => {
            const s = adminStatus(r, today);
            return {
              key: r.payload.id,
              cells: {
                license: (
                  <Box sx={{ display: 'grid' }}>
                    <a href={consoleHref(`/admin/licenses/${r.payload.id}`)}>{r.payload.licensee ?? r.payload.id}</a>
                    <Muted>{r.payload.id}</Muted>
                  </Box>
                ),
                pack: `${packName(r.payload)} · ${kindNames[r.payload.kind]}`,
                status: <Badge tone={statusTone[s]}>{adminStatusLabel[s]}</Badge>,
                issued: day(r.payload.issued_at),
                amount: money(r.amount_total, r.currency),
              },
            };
          })}
        />
      </Panel>

      <Panel title="History">
        <DataTable
          label="History"
          empty="Nothing recorded."
          columns={[
            { key: 'at', label: 'When' },
            { key: 'who', label: 'By' },
            { key: 'what', label: 'What' },
          ]}
          rows={history.map((e) => ({
            key: String(e.id),
            cells: {
              at: dayTime(e.at),
              who: e.actorEmail ?? (e.actorUserId ? <Muted>deleted user</Muted> : <Muted>system</Muted>),
              what: describeOrgEvent(e),
            },
          }))}
        />
      </Panel>

      <Panel title="Notes">
        <AdminForm action={addOrgNoteAction} submitLabel="Add note" testId="org-note-form">
          <input type="hidden" name="orgId" value={org.id} />
          <TextField name="body" label="Note" required multiline minRows={2} slotProps={{ htmlInput: { maxLength: 4000 } }} />
        </AdminForm>
        {notes.length > 0 && (
          <Box component="ul" sx={{ m: 0, mt: 3, p: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
            {notes.map((n) => (
              <Box component="li" key={n.id} sx={{ borderTop: `1px solid ${color.rule}`, pt: 1.5 }}>
                <Muted>
                  {dayTime(n.createdAt)}
                  {n.author ? ` · ${n.author}` : ''}
                </Muted>
                <Box sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: color.ink, mt: 0.5 }}>{n.body}</Box>
              </Box>
            ))}
          </Box>
        )}
      </Panel>
    </>
  );
}
