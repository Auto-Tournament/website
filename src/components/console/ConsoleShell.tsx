/* The console's page parts. The frame (site nav, account menu, footer) is src/app/console/layout.tsx. */

import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';

const { color, radius } = tokens;

/** A page heading. */
export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Box component="h1" sx={{ m: 0, color: color.ink, fontFamily: fontDisplay, fontWeight: 700, fontSize: 'clamp(1.75rem, 2.5vw + 1rem, 2.5rem)', letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>
        {children}
      </Box>
      {sub && <Box sx={{ mt: 1.5, fontSize: '1.0625rem', maxWidth: '62ch' }}>{sub}</Box>}
    </Box>
  );
}

/** A bordered panel. */
export function Panel({ title, children, id }: { title?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <Box component="section" id={id} aria-label={typeof title === 'string' ? title : undefined} sx={{ mt: 4, p: { xs: 2, sm: 3 }, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, bgcolor: color.paper2, minWidth: 0 }}>
      {title && (
        <Box component="h2" sx={{ m: 0, mb: 2, color: color.ink, fontSize: '1.25rem', fontWeight: 600 }}>
          {title}
        </Box>
      )}
      {children}
    </Box>
  );
}
