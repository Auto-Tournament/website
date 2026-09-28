import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { ActionButton, InviteForm, RoleForm } from '@/components/console/forms';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { db } from '@/lib/db/client';
import { formatDay } from '@/lib/license/describe';
import { canManage, listInvites, listMembers } from '@/lib/console/orgs';
import { requireOrg } from '@/lib/console/session';
import { changeRoleAction, inviteAction, removeMemberAction, revokeInviteAction } from '../../actions';

const { color } = tokens;

export const metadata: Metadata = { title: 'Members' };
export const dynamic = 'force-dynamic';

const roleLabel = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

export default async function Members() {
  const { user, org } = await requireOrg();
  const manage = canManage(org.role);
  const [members, pending] = await Promise.all([listMembers(db(), user.id, org.id), manage ? listInvites(db(), user.id, org.id) : Promise.resolve([])]);
  const owners = members.filter((m) => m.role === 'owner').length;

  return (
    <>
      <PageTitle sub="Everyone here sees the organization's licenses and keys. Owners and admins invite and remove members and see invoices; only owners can make someone an owner.">
        Members
      </PageTitle>

      <Box component="ul" aria-label="Members" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid' }}>
        {members.map((m) => {
          const self = m.userId === user.id;
          const lastOwner = m.role === 'owner' && owners <= 1;
          const canEdit = manage && (org.role === 'owner' || m.role !== 'owner');
          return (
            <Box
              component="li"
              key={m.userId}
              data-testid="member"
              sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, py: 2, borderTop: `1px solid ${color.rule}` }}
            >
              <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <Box sx={{ color: color.ink, fontWeight: 600 }}>
                  {m.name || m.email}
                  {self ? ' (you)' : ''}
                </Box>
                <Box sx={{ fontSize: '0.875rem', color: color.muted }}>
                  {m.name ? `${m.email} · ` : ''}
                  {roleLabel[m.role]} since {formatDay(m.since.toISOString().slice(0, 10))}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                {canEdit && !lastOwner && <RoleForm action={changeRoleAction} orgId={org.id} userId={m.userId} role={m.role} allowOwner={org.role === 'owner'} />}
                {(canEdit || self) && !lastOwner && (
                  <ActionButton
                    action={removeMemberAction}
                    fields={{ orgId: org.id, userId: m.userId }}
                    label={self ? 'Leave' : 'Remove'}
                    color="error"
                    confirm={self ? `Leave ${org.name}?` : `Remove ${m.email ?? 'this member'} from ${org.name}?`}
                  />
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {manage && (
        <Panel title="Invite someone">
          <Typography sx={{ mb: 2, fontSize: '0.9375rem' }}>We email them a link. It works once, for 7 days, and only for that address.</Typography>
          <InviteForm action={inviteAction} orgId={org.id} canInviteOwner={org.role === 'owner'} />
        </Panel>
      )}

      {manage && pending.length > 0 && (
        <Panel title="Pending invites">
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
            {pending.map((i) => (
              <Box component="li" key={i.id} data-testid="pending-invite" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {i.email} · {roleLabel[i.role]} · expires {formatDay(i.expiresAt.toISOString().slice(0, 10))}
                </Box>
                <ActionButton action={revokeInviteAction} fields={{ orgId: org.id, inviteId: i.id }} label="Withdraw" color="error" />
              </Box>
            ))}
          </Box>
        </Panel>
      )}
    </>
  );
}
