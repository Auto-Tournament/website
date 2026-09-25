import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';

const { color } = tokens;

const email = 'sivert@autotournament.gg';

// Stripe sends buyers here after paying. It only says thanks: no Stripe call,
// the order is checked by hand before the license goes out.
export const metadata: Metadata = {
  title: 'Thanks for your order',
  robots: { index: false, follow: false },
  alternates: { canonical: '/pricing/thanks' },
};

export default function Thanks() {
  return (
    <>
      <Nav />
      <main>
        <Container maxWidth="md" component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 8, md: 12 } }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)' }}>
            Thanks! Payment received.
          </Typography>
          <Typography sx={{ mt: 3, maxWidth: '52ch', color: color.ink2, fontSize: '1.125rem' }}>
            We&apos;ll check your details and email your license confirmation within 2 working days.
          </Typography>
          <Typography sx={{ mt: 2, maxWidth: '52ch', color: color.ink2 }}>
            Questions about your order? Email{' '}
            <Box component="a" href={`mailto:${email}`} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
              {email}
            </Box>
            .
          </Typography>
          <Button variant="outlined" href="/pricing" sx={{ mt: 4 }}>
            Back to pricing
          </Button>
        </Container>
      </main>
      <Footer />
    </>
  );
}
