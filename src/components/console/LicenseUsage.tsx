import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Badge, DataTable } from '@/components/admin/AdminUi';
import { dayTime } from '@/components/admin/format';
import { CHECKIN_RULES, type Usage } from '@/lib/license/checkin';

const { color, radius } = tokens;

const declaredText: Record<Usage['declared'], string> = {
  none: 'No answer',
  testing: 'Testing or setting up',
  new_event: 'A new event',
  dates_moved: 'Our event dates moved',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Where a license key is in use, from the daily check-ins of the instances
 * that have it saved (src/lib/license/checkin.ts). The customer's view is
 * calm and informational; `admin` adds Auto Tournament's own flags.
 */
export function LicenseUsage({ usage, notice, admin = false }: { usage: Usage; notice?: string | null; admin?: boolean }) {
  const n = usage.instances.length;
  return (
    <Box data-testid="license-usage" sx={{ p: 2.5, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Typography sx={{ color: color.ink, fontWeight: 600 }}>
        {n === 0
          ? `Not checked in during the last ${CHECKIN_RULES.windowDays} days`
          : `In use on ${plural(n, 'instance', 'instances')}, ${plural(usage.windowServers, 'server', 'servers')} (last ${CHECKIN_RULES.windowDays} days)`}
      </Typography>
      {admin && (usage.overServers || usage.outsideDates) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="usage-flags">
          {usage.overServers && (
            <Badge tone="bad">
              Overuse: {usage.activeServers} servers on {usage.activeInstances} active instances, pack {usage.maxServers}
            </Badge>
          )}
          {usage.outsideDates && (
            <Badge tone={usage.fullEventOutside ? 'bad' : 'warn'}>
              {usage.fullEventOutside ? 'Event-sized use outside the dates' : 'Activity outside the dates'} · answer: {declaredText[usage.declared]}
            </Badge>
          )}
        </Box>
      )}
      {!admin && notice && <Box sx={{ color: color.ink2, fontSize: '0.9375rem', maxWidth: '70ch' }}>{notice}</Box>}
      {n === 0 ? (
        <Box sx={{ color: color.muted, fontSize: '0.875rem', maxWidth: '70ch' }}>
          Instances with this key check in once a day when they can reach the internet. Offline and LAN instances don&apos;t, and that&apos;s fine.
        </Box>
      ) : (
        <DataTable
          label="Instances using this license"
          columns={[
            { key: 'instance', label: 'Instance' },
            { key: 'last', label: 'Last seen' },
            { key: 'servers', label: 'Servers', align: 'right' },
            { key: 'version', label: 'Version' },
            ...(admin ? [{ key: 'first', label: 'First seen' }] : []),
          ]}
          rows={usage.instances.map((i) => ({
            key: i.instanceId,
            cells: {
              instance: <Box component="code" sx={{ fontSize: '0.8125rem' }}>{i.label}</Box>,
              last: `${dayTime(i.lastSeen)}${i.active ? '' : ' (inactive)'}`,
              servers: String(i.serverCount),
              version: i.platformVersion,
              first: dayTime(i.firstSeen),
            },
          }))}
        />
      )}
      {admin && usage.outsideDays.length > 0 && (
        <Box sx={{ fontSize: '0.875rem', color: color.ink2 }} data-testid="outside-days">
          Outside the dates:{' '}
          {usage.outsideDays.map((d) => `${d.day} (${d.matches} matches, ${d.tournaments} tournaments, largest ${d.maxTeams} teams)`).join('; ')}
        </Box>
      )}
    </Box>
  );
}
