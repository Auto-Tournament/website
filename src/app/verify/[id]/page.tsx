import { dbError } from '@/lib/db/errors';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { DetailList } from '@/components/LicenseKeyView';
import { VerifyForm } from '@/components/VerifyForm';
import { links } from '@/components/links';
import { clientIp, createRateLimiter } from '@/lib/checkout';
import { todayUtc } from '@/lib/license/describe';
import { licenseStore } from '@/lib/license/store';
import { LICENSE_ID, publicCheck, type PublicCheck } from '@/lib/license/verify';

const { color } = tokens;

// Public license check: /verify/L-…. Shows the licensee, pack, period and
// status, so an event or client can see a license is real. Never the key,
// email, customer id or order reference. Unknown and malformed ids get the
// same "not found". Rate-limited per IP; not indexed.
export const metadata: Metadata = {
  title: 'License check',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });

const statusColor: Record<Exclude<PublicCheck['status'], 'not-found'>, string> = {
  valid: color.live,
  upcoming: color.info,
  expired: color.ban,
  test: color.warn,
  replaced: color.info,
  revoked: color.ban,
};

async function check(id: string): Promise<PublicCheck | 'busy' | 'error'> {
  if (!allow(clientIp((await headers()) as unknown as Headers), Date.now())) return 'busy';
  if (!LICENSE_ID.test(id)) return { status: 'not-found' };
  try {
    return publicCheck(await licenseStore().byLicenseId(id), todayUtc());
  } catch (err) {
    console.error('[license] public check failed', dbError(err));
    return 'error';
  }
}

export default async function VerifyLicense({ params }: { params: Promise<{ id: string }> }) {
  let id = '';
  try {
    id = decodeURIComponent((await params).id).slice(0, 80);
  } catch {
    // A malformed %-escape: the same "not found" as any unknown id.
  }
  const result = await check(id);

  return (
    <>
      <Nav />
      <main>
        <Container maxWidth="md" component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 8, md: 12 }, color: color.ink2 }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)', color: color.ink }}>
            License check
          </Typography>

          {result === 'busy' && <Typography sx={{ mt: 3 }}>Too many checks from here. Try again in a minute.</Typography>}
          {result === 'error' && <Typography sx={{ mt: 3 }}>Couldn&apos;t check the license right now. Try again later.</Typography>}

          {typeof result === 'object' && result.status === 'not-found' && (
            <>
              <Typography sx={{ mt: 3 }} data-testid="license-status">
                Not found: no Auto Tournament license has this id.
              </Typography>
              <VerifyForm />
            </>
          )}

          {typeof result === 'object' && result.status !== 'not-found' && (
            <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
              <Typography data-testid="license-status" sx={{ color: color.ink, fontSize: '1.125rem', fontWeight: 600 }}>
                <Box component="span" aria-hidden sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', bgcolor: statusColor[result.status], mr: 1.25 }} />
                {result.statusText}
              </Typography>
              {result.replacedBy && (
                <Typography sx={{ fontSize: '0.9375rem' }}>
                  The old key keeps working in the products, but this license was reissued.{' '}
                  <Box component="a" href={`/verify/${result.replacedBy}`} sx={{ color: 'inherit' }}>
                    Check {result.replacedBy}
                  </Box>
                  .
                </Typography>
              )}
              <DetailList rows={result.rows} />
              <Typography sx={{ fontSize: '0.9375rem' }}>
                What a license allows is in the <Box component="a" href={links.terms} sx={{ color: 'inherit' }}>Commercial License Terms</Box>.
              </Typography>
            </Box>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}
