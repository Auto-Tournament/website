import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { tokens } from '@/theme/tokens';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { AdminForm } from '@/components/admin/AdminClient';
import { Badge, Muted } from '@/components/admin/AdminUi';
import { AddPasskeyButton, ApprovedForm, SignOutEverywhere } from '@/components/admin/Passkeys';
import { dayTime } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { isUsable, passkeysOf } from '@/lib/admin/passkeys';
import { removePasskeyAction, renamePasskeyAction } from '../passkeyActions';

const { color } = tokens;

export const metadata: Metadata = { title: 'Passkeys' };
export const dynamic = 'force-dynamic';

export default async function AdminPasskeys() {
  const user = await requireAdmin();
  const keys = await passkeysOf(db(), user.id);
  const now = new Date();
  const usable = keys.filter((k) => isUsable(k, now));
  return (
    <>
      <PageTitle sub="Your passkeys for the admin console. Adding one needs a link sent to your email; removing one needs a passkey check. Keep at least two, on different devices.">
        Passkeys
      </PageTitle>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 2 }} data-testid="passkeys">
        {keys.map((k) => (
          <Box component="li" key={k.id} sx={{ border: `1px solid ${color.rule}`, borderRadius: 1, p: 2, display: 'grid', gap: 1.5 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'baseline' }}>
              <strong>{k.name}</strong>
              {!isUsable(k, now) && <Badge tone="warn">Works from {dayTime(k.usableFrom)} (recovery)</Badge>}
              <Muted>
                added {dayTime(k.createdAt)}
                {k.lastUsedAt ? ` · last used ${dayTime(k.lastUsedAt)}` : ''}
              </Muted>
            </Box>
            <AdminForm action={renamePasskeyAction} submitLabel="Rename" testId="rename-passkey">
              <input type="hidden" name="passkeyId" value={k.id} />
              <TextField name="name" label="Name" defaultValue={k.name} size="small" slotProps={{ htmlInput: { maxLength: 60 } }} />
            </AdminForm>
            {(usable.length > 1 || !isUsable(k, now)) && (
              <ApprovedForm
                action={removePasskeyAction}
                approval={{ action: 'passkey.remove', target: k.id }}
                submitLabel="Remove"
                tone="error"
                confirm={`Remove the passkey "${k.name}"?`}
                testId="remove-passkey"
              >
                <input type="hidden" name="passkeyId" value={k.id} />
              </ApprovedForm>
            )}
          </Box>
        ))}
      </Box>
      <Panel title="Add a passkey">
        <AddPasskeyButton />
      </Panel>
      <Panel title="Sign out everywhere">
        <Box sx={{ mb: 2, fontSize: '0.9375rem', maxWidth: '70ch' }}>Ends every console session of yours, this one too. Use it if a passkey or a device went missing.</Box>
        <SignOutEverywhere />
      </Panel>
    </>
  );
}
