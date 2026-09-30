/*
 * Hallmark · macrostructure: Game hub (breadcrumb → hero → tool cards → other plugins → the platform → commercial use)
 * genre: modern-minimal · theme: Auto Tournament system (src/theme/tokens.ts, Sora + Geist) · nav: N5 · footer: Ft5
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { BadgeChip, CommercialUse, Crumbs, FeatureGroups, LinkButton, ProductIcon, TextLink, ToolCard } from '@/components/product/ProductParts';
import { findGame, gamePath, gamesWithPages, platform, readyUpFeatures, readyUpFeaturesIntro } from '@/content/catalog';
import { links } from '@/components/links';

const { color, radius } = tokens;

type Params = { game: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return gamesWithPages.map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const game = findGame((await params).game);
  if (!game) return {};
  const title = `${game.name}: plugins and tools`;
  const url = gamePath(game);
  return {
    title,
    description: game.description,
    alternates: { canonical: url },
    openGraph: { title, description: game.description, url: `https://autotournament.gg${url}` },
    twitter: { title, description: game.description },
  };
}

const h2 = { fontSize: 'clamp(1.75rem, 1.6vw + 1rem, 2.25rem)' } as const;

export default async function GamePage({ params }: { params: Promise<Params> }) {
  const game = findGame((await params).game);
  if (!game) notFound();
  const cs2 = game.slug === 'cs2';
  return (
    <>
      <main>
        <Container maxWidth="lg" component="section" sx={{ pt: { xs: 8, md: 13 }, pb: { xs: 5, md: 8 } }}>
          <Crumbs
            items={[
              { label: 'Games', href: '/games' },
              { label: game.name, href: gamePath(game) },
            ]}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Box component="img" src={game.image} alt="" width={64} height={64} sx={{ borderRadius: '15px', display: 'block' }} />
            <BadgeChip badge={game.badge} />
          </Box>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.5rem, 3.4vw + 1rem, 4.25rem)', maxWidth: '16ch' }}>
            {game.name}
          </Typography>
          <Typography sx={{ mt: 3, maxWidth: '58ch', color: color.ink2, fontSize: '1.125rem' }}>{game.summary}</Typography>
          {cs2 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 4 }}>
              <LinkButton link={{ label: 'Is Ready Up working on today’s CS2?', href: links.compatibility }} />
            </Box>
          )}
        </Container>

        <Container maxWidth="lg" component="section" aria-labelledby="tools-title" sx={{ py: { xs: 5, md: 8 } }}>
          <Typography id="tools-title" variant="h2" sx={h2}>
            Plugins and tools
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))', gap: 2, mt: 4 }}>
            {game.tools.map((t) => (
              <ToolCard key={t.slug} game={game} tool={t} />
            ))}
          </Box>

          {game.others && game.others.length > 0 && (
            <Box sx={{ mt: 4, display: 'grid', gap: 1.5 }}>
              {game.others.map((o) => (
                <Box
                  key={o.name}
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: { xs: 1.5, md: 3 },
                    p: 2.5,
                    border: `1px solid ${color.rule}`,
                    borderRadius: `${radius.md}px`,
                  }}
                >
                  <Box sx={{ display: 'grid', gap: 0.5, flex: '1 1 20rem', minWidth: 0 }}>
                    <Typography sx={{ color: color.ink, fontWeight: 600 }}>{o.name}</Typography>
                    <Typography sx={{ color: color.ink2, fontSize: '0.9375rem' }}>{o.line}</Typography>
                  </Box>
                  <BadgeChip badge={o.badge} />
                  <TextLink href={o.href}>GitHub</TextLink>
                </Box>
              ))}
            </Box>
          )}
        </Container>

        {cs2 && <FeatureGroups intro={readyUpFeaturesIntro} groups={readyUpFeatures} />}

        <Container maxWidth="lg" component="section" aria-labelledby="platform-title" sx={{ py: { xs: 5, md: 8 } }}>
          <Box
            component="a"
            href="/platform"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'auto minmax(0,1fr)' },
              gap: { xs: 2, sm: 3 },
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
            <ProductIcon icon="platform" size={56} />
            <div>
              <Typography id="platform-title" variant="h3" component="h2" sx={{ fontSize: '1.375rem' }}>
                Running a tournament? That’s {platform.name}.
              </Typography>
              <Typography sx={{ mt: 0.75, color: color.ink2 }}>
                The platform builds the bracket, runs the veto and sends every {game.name} match to your servers. Read about the platform →
              </Typography>
            </div>
          </Box>
        </Container>

        <CommercialUse
          extra={
            cs2
              ? ['Spares count too. The license is sized by how many game servers you run, and CS2 Server Manager counts every server it set up.']
              : undefined
          }
          mit={cs2 ? 'MatchZy Enhanced is MIT licensed and never needs a license on its own.' : undefined}
        />
      </main>
    </>
  );
}
