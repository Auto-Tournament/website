/*
 * Hallmark · macrostructure: Index (hero → featured games with their own page → tile grid of reported games)
 * genre: modern-minimal · theme: Auto Tournament system (src/theme/tokens.ts, Sora + Geist) · nav: N5 · footer: Ft5
 */
import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { BadgeChip, TextLink } from '@/components/product/ProductParts';
import { gamePath, games, gamesWithPages, repo } from '@/content/catalog';

const { color, radius } = tokens;

const title = 'Games we support';
const description =
  'Counter-Strike 2 comes as a module that ships with Auto Tournament, with its own plugins and tools. In 3.0, every other game runs on manual reporting: captains report the score and the other captain agrees.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/games' },
  openGraph: { title, description, url: 'https://autotournament.gg/games' },
  twitter: { title, description },
};

export default function GamesPage() {
  const reported = games.filter((g) => !g.tools?.length);
  return (
    <>
      <main>
        <Container maxWidth="lg" component="section" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 5, md: 8 } }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.5rem, 3.4vw + 1rem, 4.25rem)', maxWidth: '16ch' }}>
            Games we{' '}
            <Box component="span" sx={{ color: color.accent }}>
              support
            </Box>
          </Typography>
          <Typography sx={{ mt: 3, maxWidth: '58ch', color: color.ink2, fontSize: '1.125rem' }}>
            Each game is a module. The CS2 module ships with the platform: the match plugin on your servers reports every round back. Pick a game to see its plugins, its tools
            and what commercial use needs.
          </Typography>
        </Container>

        <Container maxWidth="lg" component="section" aria-label="Games with their own tools" sx={{ py: { xs: 4, md: 6 } }}>
          <Box sx={{ display: 'grid', gap: 2 }}>
            {gamesWithPages.map((g) => (
              <Box
                key={g.slug}
                component="a"
                href={gamePath(g)}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'auto minmax(0,1fr)' },
                  gap: { xs: 2.5, sm: 4 },
                  alignItems: 'center',
                  p: { xs: 3, md: 4 },
                  bgcolor: color.paper2,
                  border: `1px solid ${color.accent}`,
                  borderRadius: `${radius.lg}px`,
                  color: 'inherit',
                  textDecoration: 'none',
                  '&:hover': { bgcolor: color.paper3 },
                }}
              >
                <Box component="img" src={g.image} alt="" width={96} height={96} sx={{ borderRadius: '22px', display: 'block' }} />
                <Box sx={{ display: 'grid', gap: 1, justifyItems: 'start', minWidth: 0 }}>
                  <BadgeChip badge={g.badge} />
                  <Typography variant="h2" sx={{ fontSize: 'clamp(1.75rem, 1.6vw + 1rem, 2.25rem)' }}>
                    {g.name}
                  </Typography>
                  <Typography sx={{ color: color.ink2 }}>{g.line}</Typography>
                  <Typography sx={{ color: color.muted, fontSize: '0.9375rem' }}>
                    {g.tools.map((t) => t.name).join(' · ')} →
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Container>

        <Container maxWidth="lg" component="section" aria-labelledby="reported-title" sx={{ py: { xs: 6, md: 10 } }}>
          <Box sx={{ maxWidth: '44rem', display: 'grid', gap: 2 }}>
            <Typography id="reported-title" variant="h2" sx={{ fontSize: 'clamp(1.75rem, 1.6vw + 1rem, 2.25rem)' }}>
              Reported by the teams
            </Typography>
            <Typography sx={{ color: color.ink2 }}>
              For games the platform can’t watch, a captain reports the score, the other captain agrees, and an admin settles a dispute. The bracket, ratings and
              Swiss pairings work the same as for CS2. Each game is a game pack: a small file with its name, its tile and the stats a captain fills in.
            </Typography>
            <Box sx={{ justifySelf: 'start' }}>
              <BadgeChip badge={{ label: 'Arrives in 3.0, now in beta', tone: 'soon' }} />
            </Box>
          </Box>
          <Box
            component="ul"
            sx={{ listStyle: 'none', m: 0, p: 0, mt: 5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 11rem), 1fr))', gap: 1.5 }}
          >
            {reported.map((g) => (
              <Box
                component="li"
                key={g.slug}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.md}px`, minWidth: 0 }}
              >
                <Box component="img" src={g.image} alt="" width={36} height={36} loading="lazy" sx={{ borderRadius: '8px', display: 'block', flex: 'none' }} />
                <Typography sx={{ color: color.ink, fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.3, minWidth: 0 }}>{g.name}</Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 4, color: color.muted, fontSize: '0.9375rem', maxWidth: '60ch' }}>
            These come with a fresh install, and you can remove any of them. More are in the <TextLink href={repo.packs}>community pack list</TextLink>, and a game
            pack is a short JSON file: open a pull request to add yours. See <TextLink href="https://docs.autotournament.gg/guides/manual-reporting">manual reporting</TextLink>.
          </Typography>
        </Container>
      </main>
    </>
  );
}
