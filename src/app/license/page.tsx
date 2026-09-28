import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { LicenseRetrieve } from '@/components/LicenseRetrieve';
import { links } from '@/components/links';
import { seller } from '@/components/seller';
import { emailConfig } from '@/lib/email/postmark';

const { color } = tokens;

const title = 'Your license key';
const description = 'Get your Auto Tournament license key again, and what it contains.';

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: true },
  alternates: { canonical: '/license' },
};

// Reads POSTMARK_SERVER_TOKEN at request time (the "Email it to me again" button).
export const dynamic = 'force-dynamic';

export default function LicensePage() {
  const emailEnabled = emailConfig() !== null;
  return (
    <>
      <Nav />
      <main>
        <Container
          maxWidth="md"
          component="section"
          sx={{
            pt: { xs: 8, md: 14 },
            pb: { xs: 8, md: 12 },
            color: color.ink2,
            '& h2': { color: color.ink, mt: { xs: 5, md: 6 }, mb: 1.5, fontSize: '1.375rem' },
            '& p, & li': { lineHeight: 1.65, maxWidth: '68ch' },
            '& a': { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule },
          }}
        >
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)', color: color.ink }}>
            {title}
          </Typography>
          <Typography sx={{ mt: 3, fontSize: '1.0625rem' }}>
            Every card purchase gets a signed license key, shown right after checkout{emailEnabled ? ' and emailed to the address you paid with' : ''}. Lost it? Enter the order reference from the thanks page, or the invoice
            number on your Stripe receipt, and the email you paid with.
          </Typography>
          <LicenseRetrieve emailEnabled={emailEnabled} />

          <Typography variant="h2">What the key is</Typography>
          <p>
            You paste the key into Ready Up or the platform. They check it offline, with no license server. The key never locks anything: if something is off,
            such as more servers than the pack allows or a release line newer than your updates, you see a warning, and the software keeps working.
          </p>
          <p>
            It contains: a license id, your Stripe customer id, the business name you gave at checkout, the product and pack, its server limit, the period, the
            date it was issued, the date your updates run until and, for one event, the event dates. Anyone you give the key to can read these. See the{' '}
            <a href={`${links.privacy}#license-key`}>privacy policy</a>.
          </p>

          <Typography variant="h2">For developers</Typography>
          <Box component="p">
            Keys are Ed25519-signed tokens, <code>ATL1.&lt;payload&gt;.&lt;signature&gt;</code>. The public keys are at{' '}
            <a href="/api/license/public-keys">/api/license/public-keys</a>. Questions: <a href={`mailto:${seller.email}`}>{seller.email}</a>.
          </Box>
        </Container>
      </main>
      <Footer />
    </>
  );
}
