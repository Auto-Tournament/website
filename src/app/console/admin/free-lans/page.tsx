import type { Metadata } from 'next';
import TextField from '@mui/material/TextField';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { AdminForm } from '@/components/admin/AdminClient';
import { DataTable, SectionHead } from '@/components/admin/AdminUi';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { listFreeLans } from '@/lib/admin/leads';
import { formatDay } from '@/lib/license/describe';
import { consoleHref } from '@/lib/console/urls';
import { createFreeLanAction } from '../actions';

export const metadata: Metadata = { title: 'Free LANs' };
export const dynamic = 'force-dynamic';

export default async function AdminFreeLans() {
  await requireAdmin();
  const lans = await listFreeLans(db());
  return (
    <>
      <PageTitle sub="Non-profit LANs we confirmed may use the paid tools for free. Add one from a lead (topic “Free LAN confirmation”) or here by hand.">
        Free LAN confirmations
      </PageTitle>
      <DataTable
        label="Free LAN confirmations"
        empty="None yet."
        columns={[
          { key: 'confirmed', label: 'Confirmed' },
          { key: 'event', label: 'Event' },
          { key: 'organizer', label: 'Organizer' },
          { key: 'dates', label: 'Dates' },
          { key: 'servers', label: 'Servers' },
          { key: 'note', label: 'Note' },
        ]}
        rows={lans.map((l) => ({
          key: l.id,
          cells: {
            confirmed: formatDay(l.confirmedOn),
            event: l.leadId ? <a href={consoleHref(`/admin/leads/${l.leadId}`)}>{l.event}</a> : l.event,
            organizer: l.organizer,
            dates: l.dates,
            servers: l.servers,
            note: l.note,
          },
        }))}
      />
      <SectionHead title="Add by hand" />
      <Panel>
        <AdminForm action={createFreeLanAction} submitLabel="Add" columns={2} testId="free-lan-form">
          <TextField name="event" label="Event" required slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField name="organizer" label="Organizer" required slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField name="dates" label="Dates" slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField name="servers" label="Servers" slotProps={{ htmlInput: { maxLength: 100 } }} />
          <TextField name="confirmedOn" label="Confirmed on" type="date" helperText="Empty: today." slotProps={{ inputLabel: { shrink: true } }} />
          <TextField name="note" label="Note" multiline minRows={1} slotProps={{ htmlInput: { maxLength: 4000 } }} />
        </AdminForm>
      </Panel>
    </>
  );
}
