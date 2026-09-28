import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { VerifyForm } from '@/components/VerifyForm';
import { LICENSE_ID } from '@/lib/license/verify';

const { color } = tokens;

export const metadata: Metadata = {
  title: 'Check a license',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// The "Check a license" form posts here (GET ?id=…); a well-formed id goes on to /verify/<id>.
export default async function VerifyIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).id;
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (LICENSE_ID.test(id)) redirect(`/verify/${id}`);
  return (
    <>
      <Nav />
      <main>
        <Container maxWidth="md" component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 8, md: 12 }, color: color.ink2 }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)', color: color.ink }}>
            Check a license
          </Typography>
          <Typography sx={{ mt: 3, maxWidth: '60ch' }}>
            {id ? 'No license has that id. Check it and try again.' : 'Enter a license id (L-…) to see whether it is valid, and for whom.'}
          </Typography>
          <VerifyForm defaultValue={id.slice(0, 60)} />
        </Container>
      </main>
      <Footer />
    </>
  );
}
