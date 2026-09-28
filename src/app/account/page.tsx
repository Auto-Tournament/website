import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { AccountLicense, type RepoCoverage } from '@/components/AccountLicense';
import { AccountSignIn } from '@/components/AccountSignIn';
import { links } from '@/components/links';
import { seller } from '@/components/seller';
import { accountEnabled, currentAccount } from '@/lib/account/service';
import { repoLines, repoNames, reposFor } from '@/lib/account/github';
import { coverageFor, type Line } from '@/lib/account/versions';
import { todayUtc } from '@/lib/license/describe';
import { licenseStore, type LicenseRecord } from '@/lib/license/store';
import { siteUrl } from '@/lib/site';

const { color } = tokens;

// The customer license portal: sign in with an emailed link (no password),
// then see every license bought with that email, newest first. Off unless
// ACCOUNT_SESSION_SECRET and POSTMARK_SERVER_TOKEN are set (lib/account).
export const metadata: Metadata = {
  title: 'Your licenses',
  description: 'Sign in with the email you paid with to see your Auto Tournament licenses.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/account' },
};

export const dynamic = 'force-dynamic';

const signinMessages: Record<string, string> = {
  invalid: 'That sign-in link has expired or was already used. Ask for a new one below.',
  busy: 'Too many sign-in attempts. Wait 10 minutes and try again.',
  error: "Couldn't sign you in. Try again, or email us.",
};

/** Lines per repo for these licenses; null when any repo couldn't be read (the section is hidden then). */
async function releaseLinesFor(records: LicenseRecord[]): Promise<Map<string, Line[]> | null> {
  const repos = [...new Set(records.flatMap((r) => reposFor(r.payload.product)))];
  const lines = await Promise.all(repos.map((repo) => repoLines(repo)));
  if (lines.some((l) => l === null)) return null;
  return new Map(repos.map((repo, i) => [repo, lines[i] as Line[]]));
}

function versionsFor(record: LicenseRecord, lines: Map<string, Line[]> | null): RepoCoverage[] | null {
  if (!lines) return null;
  return reposFor(record.payload.product).map((repo) => ({
    repo,
    name: repoNames[repo] ?? repo,
    coverage: coverageFor(lines.get(repo) ?? [], record.payload.updates_until),
  }));
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const enabled = accountEnabled();
  const account = enabled ? await currentAccount() : null;
  const signin = (await searchParams).signin;
  const notice = typeof signin === 'string' ? signinMessages[signin] : undefined;

  let records: LicenseRecord[] | null = null;
  let loadError = false;
  if (account) {
    try {
      records = await licenseStore().forEmail(account.emailSha256);
    } catch (err) {
      console.error('[account] could not read the licenses', err instanceof Error ? err.message : 'unknown error');
      loadError = true;
    }
  }
  const lines = records && records.length > 0 ? await releaseLinesFor(records) : null;
  const site = siteUrl() ?? '';
  const today = todayUtc();

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
            '& h2': { color: color.ink, fontSize: '1.375rem' },
            '& p, & li': { lineHeight: 1.65, maxWidth: '68ch' },
            '& a': { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule },
            '& strong': { color: color.ink, fontWeight: 600 },
          }}
        >
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)', color: color.ink }}>
            Your licenses
          </Typography>

          {!enabled && (
            <Typography sx={{ mt: 3, fontSize: '1.0625rem' }}>
              Signing in isn&apos;t available right now. Get your license key on the <a href={links.license}>license page</a> with your order reference and
              email, or email <a href={`mailto:${seller.email}`}>{seller.email}</a>.
            </Typography>
          )}

          {enabled && !account && (
            <>
              <Typography sx={{ mt: 3, fontSize: '1.0625rem' }}>
                Sign in with the email you paid with to see all your licenses, their keys, and which versions each one covers. We email you a link; there is
                no password.
              </Typography>
              {notice && (
                <Typography role="alert" sx={{ mt: 2, color: color.ink }}>
                  {notice}
                </Typography>
              )}
              <AccountSignIn />
              <Typography sx={{ mt: 3 }}>
                Only need one key? Get it on the <a href={links.license}>license page</a> with the order reference.
              </Typography>
            </>
          )}

          {account && (
            <>
              <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '1.0625rem' }}>
                  {loadError
                    ? "Couldn't load your licenses. Try again later."
                    : records && records.length > 0
                      ? `${records.length} ${records.length === 1 ? 'license' : 'licenses'} for this email, newest first.`
                      : 'No licenses for this email.'}
                </Typography>
                <Box component="form" action="/api/account/signout" method="post">
                  <Button type="submit" variant="outlined" size="small">
                    Sign out
                  </Button>
                </Box>
              </Box>
              {records?.map((r) => (
                <AccountLicense
                  key={r.session_id}
                  license={r.payload}
                  token={r.token}
                  reference={r.session_id}
                  livemode={r.livemode}
                  today={today}
                  checkUrl={`${site}/verify/${r.payload.id}`}
                  versions={versionsFor(r, lines)}
                />
              ))}
            </>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}
