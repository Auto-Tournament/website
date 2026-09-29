import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import { requireAdmin } from '@/lib/admin/guard';
import { gateFor } from '@/lib/admin/approval';
import { passkeysOf } from '@/lib/admin/passkeys';
import { PasskeyCheck, PasskeySetup } from '@/components/admin/Passkeys';
import { db } from '@/lib/db/client';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin · Auto Tournament console' } };
export const dynamic = 'force-dynamic';

// The admin CRM: Auto Tournament staff only (ADMIN_EMAILS). Everyone else gets
// a 404. Each page and action checks again: a layout alone doesn't guard them.
// Then the passkey gate (src/lib/admin/passkeys.ts): no passkey yet → only
// "Set up a passkey"; this session not checked in 12 hours → only the check.
// The actions and the export check the gate themselves too. The admin
// sections live in the console's single navbar now (ConsoleNav.tsx).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const gate = await gateFor(user);
  if (gate !== 'ok') {
    const waiting = gate === 'setup' ? (await passkeysOf(db(), user.id)).find((k) => k.usableFrom.getTime() > Date.now()) : undefined;
    return (
      <Box data-admin-wide sx={{ minWidth: 0 }}>
        {gate === 'setup' ? <PasskeySetup waiting={waiting ? `${waiting.usableFrom.toISOString().slice(0, 16).replace('T', ' ')} UTC` : null} /> : <PasskeyCheck />}
      </Box>
    );
  }
  return (
    <Box data-admin-wide sx={{ minWidth: 0 }}>
      {children}
    </Box>
  );
}
