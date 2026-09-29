import type { Metadata } from 'next';
import { Suspense } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { SellerDetails } from '@/components/legal';
import { ContactForm } from '@/components/ContactForm';
import { seller } from '@/components/seller';
import { emailConfig } from '@/lib/email/postmark';

const { color, radius } = tokens;

const title = 'Contact';
const description = 'Ask about licensing, a custom quote, a free LAN confirmation, or paying by invoice.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/contact' },
  openGraph: { title, description, url: 'https://autotournament.gg/contact' },
  twitter: { title, description },
};

// emailConfig() reads process.env at request time, so this page must not be
// statically rendered at build time (when the real env isn't set yet).
export const dynamic = 'force-dynamic';

export default function Contact() {
  const emailAvailable = !!emailConfig();
  return (
    <>
      <main>
        <Container maxWidth="md" component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 8, md: 12 } }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)' }}>
            {title}
          </Typography>
          <Typography sx={{ mt: 2, mb: { xs: 4, md: 5 }, maxWidth: '56ch', color: color.ink2, fontSize: '1.0625rem' }}>
            Tell us what you need and we&apos;ll reply within 2 working days.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1.3fr) minmax(0,1fr)' }, gap: { xs: 5, md: 6 }, alignItems: 'start' }}>
            <Suspense fallback={null}>
              <ContactForm emailAvailable={emailAvailable} />
            </Suspense>

            <Box sx={{ display: 'grid', gap: 2.5 }}>
              <Box sx={{ p: 2.5, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, bgcolor: color.paper2 }}>
                <Typography sx={{ color: color.ink, fontWeight: 600, mb: 0.5 }}>Prefer email?</Typography>
                <Typography sx={{ fontSize: '0.9375rem' }}>
                  <a href={`mailto:${seller.email}`}>{seller.email}</a>
                </Typography>
              </Box>
              <Box sx={{ p: 2.5, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, bgcolor: color.paper2, '& a': { color: 'inherit' } }}>
                <SellerDetails />
              </Box>
            </Box>
          </Box>
        </Container>
      </main>
    </>
  );
}
