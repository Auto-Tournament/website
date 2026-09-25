import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { links } from '@/components/links';
import { CompatibilityLive } from '@/components/compat/CompatibilityLive';
import { CompatDot, type CompatTone } from '@/components/compat/CompatDot';
import type { CompatView } from '@/lib/compat/document';
import { getCompatView } from '@/lib/compat/service';

const { color, radius } = tokens;

// fontMono lives in the 'use client' theme module; a server component can't read its values.
const mono = { fontFamily: 'var(--font-mono), monospace' } as const;

// The latest run is read at request time (from the data file, or Ready Up's
// published compat.json), then the page follows it live.
export const dynamic = 'force-dynamic';

const title = 'Ready Up compatibility';
const description =
  'Does Ready Up work on the latest CS2 update? Every new CS2 build is checked against the Ready Up plugin suite, usually within minutes. Live status per plugin, CS2 patch and build, and recent runs.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/compatibility' },
  openGraph: { title, description, url: 'https://autotournament.gg/compatibility' },
  twitter: { title, description },
};

const legend: { tone: CompatTone; name: string; body: string }[] = [
  { tone: 'pass', name: 'Compatible', body: 'Every check passed on this build.' },
  {
    tone: 'warn',
    name: 'Static check OK, live check pending',
    body: 'Everything Ready Up needs from the engine is still there. Until the real-server check exists, this is the best result a build can get. Plugins that never touch the engine show as pending.',
  },
  { tone: 'fail', name: 'Not compatible', body: 'Something Ready Up needs moved or broke. Hold off on updating your servers until a fix is out.' },
  { tone: 'checking', name: 'Checking…', body: 'A new build is being checked right now. The page updates by itself.' },
  { tone: 'none', name: 'No verdict', body: 'The check broke before it reached a result. The next run tries again.' },
];

const bullet = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 1.5,
  '&::before': { content: '""', width: 6, height: 6, mt: '0.55em', borderRadius: '50%', bgcolor: color.accent, flex: 'none' },
} as const;

const empty: CompatView = { latest: null, runs: [] };

async function readView(): Promise<CompatView> {
  try {
    return await getCompatView();
  } catch (err) {
    // Still render the page (empty); the stream or polling fills it in later.
    console.error('[compat] could not read the runs for the page', err instanceof Error ? err.message : 'unknown error');
    return empty;
  }
}

export default async function Compatibility() {
  const view = await readView();
  const serverNow = Date.now();
  return (
    <>
      <Nav />
      <main>
        <Container maxWidth="lg" component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 4, md: 6 } }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 4rem)', maxWidth: '20ch' }}>
            Does Ready Up work on{' '}
            <Box component="span" sx={{ color: color.accent }}>
              the latest CS2?
            </Box>
          </Typography>
          <Typography sx={{ mt: 3, maxWidth: '58ch', color: color.ink2, fontSize: '1.125rem' }}>
            CS2 updates land without warning. Every time the build changes, Ready Up&apos;s CI checks the plugin suite against it, usually within
            minutes, and the result shows up here.
          </Typography>
        </Container>

        <Container maxWidth="lg" component="section" id="status" aria-label="Status" sx={{ pb: { xs: 6, md: 10 } }}>
          <CompatibilityLive initial={view} serverNow={serverNow} />
        </Container>

        <Container maxWidth="lg" component="section" id="how" aria-labelledby="how-title" sx={{ py: { xs: 6, md: 10 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) minmax(0,1fr)' }, gap: { xs: 6, md: 8 } }}>
            <div>
              <Typography id="how-title" variant="h2">
                What gets checked
              </Typography>
              <Box component="ul" sx={{ m: 0, mt: 3, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 }}>
                <Box component="li" sx={bullet}>
                  <span>
                    <strong>Now, on every CS2 update:</strong> a static check. The CI downloads the new server binaries and looks up every engine
                    signature, virtual table slot, hook site and memory layout Ready Up relies on. If one moved, you see it here before your servers do.
                  </span>
                </Box>
                <Box component="li" sx={bullet}>
                  <span>
                    <strong>Later:</strong> a real-server check. A server boots the new build with every plugin loaded and runs Ready Up&apos;s self-test
                    and a bot match. Until then, the best result is &ldquo;Static check OK&rdquo;.
                  </span>
                </Box>
                <Box component="li" sx={bullet}>
                  <span>
                    Each plugin is its own component: core, skins, match, practice, essentials, midas, whitelist and fleet. Open one to see its checks
                    and anything that failed.
                  </span>
                </Box>
              </Box>
              <Typography sx={{ mt: 3, color: color.muted, fontSize: '0.875rem' }}>
                Want it in a README? Use the badge:{' '}
                <Box component="code" sx={{ ...mono, color: color.ink2, overflowWrap: 'anywhere' }}>
                  https://img.shields.io/endpoint?url=https://autotournament.gg/api/compat/badge.json
                </Box>
              </Typography>
            </div>
            <div>
              <Typography variant="h2">Reading the colours</Typography>
              <Box
                component="ul"
                data-testid="compat-legend"
                sx={{ m: 0, mt: 3, p: 0, listStyle: 'none', display: 'grid', gap: 1.5 }}
              >
                {legend.map((item) => (
                  <Box
                    component="li"
                    key={item.tone}
                    sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 2, alignItems: 'start', bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, p: 2.5 }}
                  >
                    <CompatDot tone={item.tone} size={12} sx={{ mt: '0.4em' }} />
                    <div>
                      <Typography sx={{ color: color.ink, fontWeight: 600 }}>{item.name}</Typography>
                      <Typography sx={{ color: color.ink2, fontSize: '0.9375rem' }}>{item.body}</Typography>
                    </div>
                  </Box>
                ))}
              </Box>
            </div>
          </Box>
          <Typography sx={{ mt: { xs: 5, md: 6 }, color: color.muted, fontSize: '0.875rem' }}>
            Ready Up is Auto Tournament&apos;s CS2 server plugin suite.{' '}
            <Box component="a" href={links.readyUp} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
              Ready Up on GitHub ↗
            </Box>
            {' · '}
            <Box component="a" href={links.discord} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
              Ask on Discord
            </Box>
          </Typography>
        </Container>
      </main>
      <Footer />
    </>
  );
}
