import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { links } from '@/components/links';
import { LicenseKeyView } from '@/components/LicenseKeyView';
import { clientIp, createRateLimiter } from '@/lib/checkout';
import { CHECKOUT_SESSION_ID } from '@/lib/license/format';
import { issueForSession, stripeServer } from '@/lib/license/issue';
import { licenseSigningKey } from '@/lib/license/keys';
import { emailConfig } from '@/lib/email/postmark';
import { siteUrl } from '@/lib/site';
import { consoleEnabled } from '@/lib/console/auth';
import { consoleUrl } from '@/lib/console/urls';
import { licenseStore, type LicenseRecord } from '@/lib/license/store';
import { sendConsoleLinkAction } from './actions';
import { consoleLinkAvailable } from './available';
import { ConsoleLinkButton } from './ConsoleLinkButton';

const { color } = tokens;

const email = 'sivert@autotournament.gg';

// Stripe sends buyers here after paying, with ?session_id=cs_…. When the
// license key is already issued (by the webhook) it is shown; otherwise the
// page asks Stripe whether the session is paid and issues it itself (once per
// session, lib/license/issue.ts). The owner still checks each order by hand.
export const metadata: Metadata = {
  title: 'Thanks for your order',
  robots: { index: false, follow: false },
  alternates: { canonical: '/pricing/thanks' },
  // The URL carries the order reference: don't send it to other sites.
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

/** Stripe lookups for sessions the store doesn't know yet, per IP. */
const allowLookup = createRateLimiter({ limit: 20, windowMs: 60_000 });

type State = { kind: 'license'; record: LicenseRecord } | { kind: 'pending' } | { kind: 'none' };

async function licenseFor(sessionId: string | undefined): Promise<State> {
  if (!sessionId || !CHECKOUT_SESSION_ID.test(sessionId)) return { kind: 'none' };
  try {
    const stored = await licenseStore().bySession(sessionId);
    if (stored) return { kind: 'license', record: stored };
    const stripe = stripeServer();
    if (!stripe || !licenseSigningKey()) return { kind: 'none' };
    if (!allowLookup(clientIp((await headers()) as unknown as Headers), Date.now())) return { kind: 'none' };
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const result = await issueForSession(session);
    if (result.status === 'issued' || result.status === 'existing') return { kind: 'license', record: result.record };
    return result.status === 'not_paid' ? { kind: 'pending' } : { kind: 'none' };
  } catch (err) {
    console.error('[license] thanks page could not get the license', err instanceof Error ? err.name : 'unknown error');
    return { kind: 'none' };
  }
}

const link = { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule } as const;

export default async function Thanks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).session_id;
  const state = await licenseFor(typeof raw === 'string' ? raw : undefined);

  return (
    <>
      <Nav />
      <main>
        <Container maxWidth="md" component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 8, md: 12 } }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 3.5rem)' }}>
            {state.kind === 'pending' ? 'Thanks! Payment processing.' : 'Thanks! Payment received.'}
          </Typography>

          {state.kind === 'license' && (
            <>
              <Typography sx={{ mt: 3, maxWidth: '60ch', color: color.ink2, fontSize: '1.125rem' }}>
                Here is your license key. Save it now: you paste it into Ready Up or the platform&apos;s settings.
                {emailConfig() ? ' We also email it to the address you paid with.' : ''}
              </Typography>
              <LicenseKeyView
                token={state.record.token}
                license={state.record.payload}
                reference={state.record.session_id}
                invoice={state.record.invoice_number}
                checkUrl={`${siteUrl() ?? ''}/verify/${state.record.payload.id}`}
              />
              {consoleLinkAvailable() ? (
                // Their organization and license are already in the console (created from checkout).
                <ConsoleLinkButton action={sendConsoleLinkAction} sessionId={state.record.session_id} />
              ) : (
                <Typography sx={{ mt: 3, maxWidth: '60ch', color: color.ink2 }}>
                  {consoleEnabled() ? (
                    <>
                      Lost it?{' '}
                      <Box component="a" href={consoleUrl('/')} sx={link}>
                        Sign in to the console
                      </Box>{' '}
                      with the email you paid with to see your licenses and keys any time.
                    </>
                  ) : (
                    <>
                      Lost it? Email us with the order reference above (or the invoice number on your receipt) and we&apos;ll send it again.
                    </>
                  )}
                </Typography>
              )}
            </>
          )}

          {state.kind === 'pending' && (
            <Typography sx={{ mt: 3, maxWidth: '56ch', color: color.ink2, fontSize: '1.125rem' }}>
              Your payment is still being confirmed. Your license key appears here once it clears: reload this page later.
            </Typography>
          )}

          {state.kind === 'none' && (
            <Typography sx={{ mt: 3, maxWidth: '52ch', color: color.ink2, fontSize: '1.125rem' }}>
              Your license key appears here once your payment is confirmed. If it doesn&apos;t,{' '}
              <Box component="a" href={`${links.contact}?topic=license`} sx={link}>
                contact us
              </Box>{' '}
              with your order reference and we&apos;ll send it.
            </Typography>
          )}

          <Typography sx={{ mt: 2, maxWidth: '52ch', color: color.ink2 }}>
            Questions about your order? Email{' '}
            <Box component="a" href={`mailto:${email}`} sx={link}>
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
