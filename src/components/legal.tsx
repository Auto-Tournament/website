import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { legalLastUpdated, seller } from '@/components/seller';

const { color, radius } = tokens;

/**
 * Shared layout for the legal pages (/terms, /terms-of-sale, /privacy):
 * a title, the "Last updated" line, the seller details, then the sections.
 * No 'use client': the pages are server components.
 */
export function LegalPage({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main>
        <Container
          maxWidth="md"
          component="article"
          sx={{
            pt: { xs: 8, md: 14 },
            pb: { xs: 6, md: 10 },
            color: color.ink2,
            '& h2': { color: color.ink, mt: { xs: 5, md: 6 }, mb: 1.5, fontSize: '1.375rem' },
            '& p, & li': { lineHeight: 1.65, maxWidth: '68ch' },
            '& p': { mt: 0, mb: 1.5 },
            '& ul, & ol': { mt: 0, mb: 1.5, pl: 2.5, display: 'grid', gap: 0.75 },
            '& a': { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule, overflowWrap: 'anywhere' },
            '& strong': { color: color.ink, fontWeight: 600 },
          }}
        >
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)', color: color.ink }}>
            {title}
          </Typography>
          <Typography sx={{ mt: 2, color: color.muted, fontSize: '0.9375rem' }} data-testid="last-updated">
            Last updated {legalLastUpdated}
          </Typography>
          {intro && <Typography sx={{ mt: 3, fontSize: '1.0625rem' }}>{intro}</Typography>}
          <Box component="section" aria-label="Seller" sx={{ mt: 3, p: 2.5, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, bgcolor: color.paper2 }}>
            <SellerDetails />
          </Box>
          {children}
        </Container>
      </main>
      <Footer />
    </>
  );
}

export function SellerDetails() {
  return (
    <Box component="p" sx={{ m: '0 !important', fontSize: '0.9375rem' }}>
      <strong>
        {seller.name} ({seller.form})
      </strong>
      , owned by {seller.owner}
      <br />
      Org. nr. {seller.orgNumber} (Enhetsregisteret) · {seller.vatNote}
      <br />
      {seller.address}
      <br />
      <a href={`mailto:${seller.email}`}>{seller.email}</a>
    </Box>
  );
}

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Typography variant="h2" id={id}>
      {children}
    </Typography>
  );
}
