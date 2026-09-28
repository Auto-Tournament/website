import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { AtIcon } from '@/components/AtIcon';
import { seller } from '@/components/seller';

const { color, radius } = tokens;

/**
 * The console's frame: the brand and who is signed in at the top, the seller
 * line at the bottom. Links to the main site are absolute (the console has
 * its own host in production).
 */
export function ConsoleShell({
  home,
  site,
  email,
  signOut,
  admin,
  children,
}: {
  home: string;
  site: string;
  email?: string | null;
  signOut?: () => Promise<void>;
  /** The admin CRM's link, for admins only (the server decides). */
  admin?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Box component="header" sx={{ px: 2, pt: 2 }}>
        <Box
          sx={{
            maxWidth: 960,
            mx: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            py: 1,
            pl: 2,
            pr: 1,
            bgcolor: color.navGlass,
            border: `1px solid ${color.rule}`,
            borderRadius: `${radius.lg}px`,
          }}
        >
          <Box component="a" href={home} sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: color.ink, fontFamily: fontDisplay, fontWeight: 600, whiteSpace: 'nowrap' }}>
            <AtIcon size={26} radius="7px" />
            <span>Console</span>
          </Box>
          {email && signOut && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
              {admin && (
                <Box component="a" href={admin} data-testid="admin-link" sx={{ color: `${color.ink} !important`, fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', '&:hover': { color: `${color.accent} !important` } }}>
                  Admin
                </Box>
              )}
              <Box component="span" data-testid="signed-in-as" sx={{ color: color.muted, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, maxWidth: { xs: '11rem', sm: '20rem' } }}>
                {email}
              </Box>
              <Box component="form" action={signOut}>
                <Button type="submit" size="small" variant="outlined">
                  Sign out
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <Container
        component="main"
        maxWidth="md"
        // The admin pages (data-admin-wide) get room for their tables on a laptop.
        sx={{ pt: { xs: 5, md: 8 }, pb: { xs: 8, md: 10 }, color: color.ink2, '& a': { color: 'inherit' }, '&:has([data-admin-wide])': { maxWidth: 1280 } }}
      >
        {children}
      </Container>
      <Container component="footer" maxWidth="md" sx={{ pb: 5, color: color.muted, fontSize: '0.8125rem', lineHeight: 1.6, '& a': { color: 'inherit' } }}>
        <Box sx={{ borderTop: `1px solid ${color.rule}`, pt: 3 }}>
          {seller.name} ({seller.form}), org. nr. {seller.orgNumber} · <a href={`mailto:${seller.email}`}>{seller.email}</a> · <a href={`${site}/terms`}>Terms</a> ·{' '}
          <a href={`${site}/privacy#console`}>Privacy</a> · <a href={site}>autotournament.gg</a>
        </Box>
      </Container>
    </>
  );
}

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
