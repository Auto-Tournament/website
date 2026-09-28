import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { accountEnabled } from '@/lib/account/service';

const { color } = tokens;

// Where the emailed sign-in link lands. Opening it does nothing by itself (so
// mail scanners that open links don't use it up): the button posts the token
// to /api/account/signin, which signs the buyer in.
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
  // The URL carries the sign-in token: send only the origin, never the path. (Not
  // no-referrer: that makes the form's POST carry `Origin: null`, which the
  // same-origin check refuses.)
  referrer: 'strict-origin',
};

export const dynamic = 'force-dynamic';

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
  const enabled = accountEnabled();

  return (
    <>
      <Nav />
      <main>
        <Container maxWidth="md" component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 8, md: 12 }, color: color.ink2 }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)', color: color.ink }}>
            Sign in
          </Typography>
          {enabled && token ? (
            <Box component="form" action="/api/account/signin" method="post" sx={{ mt: 3 }}>
              <input type="hidden" name="token" value={token} />
              <Typography sx={{ mb: 2 }}>Sign in to see your Auto Tournament licenses.</Typography>
              <Button type="submit" variant="contained">
                Sign in
              </Button>
            </Box>
          ) : (
            <Typography sx={{ mt: 3 }}>
              This sign-in link isn&apos;t valid. <a href="/account" style={{ color: 'inherit' }}>Ask for a new one</a>.
            </Typography>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}
