import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { AdminNav } from '@/components/admin/AdminClient';
import { requireAdmin } from '@/lib/admin/guard';
import { consoleBase } from '@/lib/console/urls';

const { color } = tokens;

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin · Auto Tournament console' } };
export const dynamic = 'force-dynamic';

// The admin CRM: Auto Tournament staff only (ADMIN_EMAILS). Everyone else gets
// a 404. Each page and action checks again: a layout alone doesn't guard them.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <Box data-admin-wide sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 1.5, mb: 2 }}>
        <Box sx={{ color: color.accent, fontWeight: 600, fontSize: '0.8125rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin</Box>
      </Box>
      <AdminNav base={consoleBase()} />
      <Box sx={{ mt: 4, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
