import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { tokens } from '@/theme/tokens';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { DetailList } from '@/components/LicenseKeyView';
import { AdminForm } from '@/components/admin/AdminClient';
import { Badge } from '@/components/admin/AdminUi';
import { dayTime, leadLabel, leadTone } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { getLead } from '@/lib/admin/leads';
import { contactTopicLabel, type ContactTopic } from '@/lib/contact';
import { LEAD_STATUSES } from '@/lib/db/schema';
import { consoleHref } from '@/lib/console/urls';
import { createFreeLanAction, updateLeadAction } from '../../actions';

const { color, radius } = tokens;

export const metadata: Metadata = { title: 'Lead' };
export const dynamic = 'force-dynamic';

export default async function AdminLead({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const lead = await getLead(db(), (await params).id);
  if (!lead) notFound();
  const topic = contactTopicLabel(lead.topic as ContactTopic);
  const mailto = `mailto:${encodeURIComponent(lead.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(`Re: ${topic}`)}`;

  return (
    <>
      <PageTitle sub={`${topic} · received ${dayTime(lead.createdAt)}`}>{lead.name}</PageTitle>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mb: 2 }}>
        <Box
          component="a"
          href={mailto}
          data-testid="reply-link"
          sx={{ px: 2, py: 0.9, borderRadius: `${radius.sm}px`, bgcolor: color.accent, color: `${color.accentInk} !important`, textDecoration: 'none', fontWeight: 600 }}
        >
          Reply by email
        </Box>
        {lead.topic === 'invoice' && <a href={consoleHref(`/admin/licenses/new?lead=${lead.id}`)}>New manual license from this lead</a>}
        <Badge tone={leadTone[lead.status]}>{leadLabel[lead.status]}</Badge>
      </Box>
      <DetailList
        rows={[
          ['Email', lead.email],
          ['Organization', lead.organization ?? '—'],
          ['Topic', topic],
          ['Servers', lead.servers ?? '—'],
          ['Event dates', lead.eventDates ?? '—'],
          ['Last activity', dayTime(lead.updatedAt)],
        ]}
      />
      <Box
        data-testid="lead-message"
        sx={{ mt: 2, p: 2.5, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: color.ink }}
      >
        {lead.message}
      </Box>

      <Panel title="Status and note">
        <AdminForm action={updateLeadAction} submitLabel="Save" testId="lead-form">
          <input type="hidden" name="leadId" value={lead.id} />
          <TextField select name="status" label="Status" defaultValue={lead.status} slotProps={{ select: { native: true } }}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {leadLabel[s]}
              </option>
            ))}
          </TextField>
          <TextField name="note" label="Note" defaultValue={lead.note ?? ''} multiline minRows={3} slotProps={{ htmlInput: { maxLength: 4000 } }} />
        </AdminForm>
      </Panel>

      {lead.topic === 'free-lan' && (
        <Panel title="Confirm as a free LAN">
          <Box sx={{ mb: 2, fontSize: '0.9375rem' }}>Adds it to the free LAN register and marks the lead won. Reply to them with the confirmation too.</Box>
          <AdminForm action={createFreeLanAction} submitLabel="Add to the register" columns={2} testId="free-lan-form">
            <input type="hidden" name="leadId" value={lead.id} />
            <TextField name="event" label="Event" required slotProps={{ htmlInput: { maxLength: 200 } }} />
            <TextField name="organizer" label="Organizer" required defaultValue={lead.organization ?? lead.name} slotProps={{ htmlInput: { maxLength: 200 } }} />
            <TextField name="dates" label="Dates" defaultValue={lead.eventDates ?? ''} slotProps={{ htmlInput: { maxLength: 200 } }} />
            <TextField name="servers" label="Servers" defaultValue={lead.servers ?? ''} slotProps={{ htmlInput: { maxLength: 100 } }} />
            <TextField name="confirmedOn" label="Confirmed on" type="date" helperText="Empty: today." slotProps={{ inputLabel: { shrink: true } }} />
            <TextField name="note" label="Note" multiline minRows={1} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          </AdminForm>
        </Panel>
      )}
    </>
  );
}
