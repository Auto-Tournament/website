'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { Reveal, mono } from './ui';
import { BracketCard } from './cards/BracketCard';
import { VetoCard } from './cards/VetoCard';
import { ServersCard } from './cards/ServersCard';
import { ProfileCard } from './cards/ProfileCard';
import { AtIcon } from './AtIcon';
import { CodeBlock } from './CodeBlock';
import { links } from './links';
import { installCommands } from '@/content/install';
import { games as catalogGames, gamePath } from '@/content/catalog';
import { BadgeChip } from './product/ProductParts';

const { color, radius } = tokens;

export { links } from './links';

export { SiteNav as Nav } from './nav/SiteNav';
export { Footer } from './Footer';

export function Hero() {
  return (
    <Box component="section">
      <Container
        maxWidth="lg"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) minmax(0,1fr)' },
          gap: { xs: 5, md: 8 },
          alignItems: 'center',
          pt: { xs: 8, md: 14 },
          pb: { xs: 6, md: 10 },
        }}
      >
        <div>
          <Box sx={{ width: { xs: 72, md: 88 }, height: { xs: 72, md: 88 }, mb: 4, borderRadius: { xs: '17px', md: '20px' }, overflow: 'hidden' }}>
            <AtIcon size="100%" title="Auto Tournament" />
          </Box>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.5rem, 3.6vw + 1rem, 4.5rem)' }}>
            The tournament runs.{' '}
            <Box
              component="span"
              sx={{ display: 'block', color: color.accent, textDecoration: 'underline', textDecorationThickness: '0.08em', textUnderlineOffset: '0.12em' }}
            >
              You play.
            </Box>
          </Typography>
          <Typography sx={{ mt: 3, maxWidth: '46ch', color: color.ink2, fontSize: '1.125rem' }}>
            Create the tournament and add your servers. Auto Tournament runs the veto, loads every match, tracks the scores and moves the bracket on. Self-hosted,
            source available, with a CS2 module included.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 4 }}>
            <Button variant="contained" href={links.install}>
              Install Auto Tournament
            </Button>
            <Button variant="outlined" href={links.repo}>
              View on GitHub
            </Button>
          </Box>
          <Typography sx={{ mt: 2, color: color.muted, fontSize: '0.875rem' }}>
            <Box component="a" href={links.licensing} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
              Free for non-commercial use · Licensing
            </Box>{' '}
            · Runs on one Docker host
          </Typography>
        </div>
        <Box sx={{ borderRadius: `${radius.lg}px` }}>
          <BracketCard />
        </Box>
      </Container>
      <Container maxWidth="lg" sx={{ pb: { xs: 4, md: 6 } }}>
        <Box
          component="figure"
          aria-label="Product preview"
          sx={{
            m: 0,
            mx: 'auto',
            width: 'min(64rem, 100%)',
            aspectRatio: '16 / 9',
            borderRadius: `${radius.lg}px`,
            overflow: 'hidden',
            border: `1px solid ${color.rule}`,
            bgcolor: color.paper2,
            position: 'relative',
          }}
        >
          {/* Replace with the real recording: public/preview.mp4 + poster. */}
          <Box component="figcaption" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 3, color: color.muted, fontSize: '0.875rem', textAlign: 'center' }}>
            <span>
              <Box component="strong" sx={{ display: 'block', color: color.ink, fontFamily: fontDisplay, fontSize: '1.375rem', mb: 0.5 }}>
                Product preview
              </Box>
              90-second recording of a tournament from bracket to final. To record.
            </span>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

type Row = { title: string; body: string; points?: string[]; card: React.ReactNode };

const rows: Row[] = [
  {
    title: 'Map veto in the browser.',
    body: 'Team captains ban and pick maps from their phone. When the veto is done, the server loads the right maps and sides.',
    points: ['Bo1, Bo3 and Bo5 formats', 'Knife round or side pick', 'Custom veto order per tournament'],
    card: <VetoCard />,
  },
  {
    title: 'Every match finds a server.',
    body: 'Add your game servers once. Auto Tournament loads each match on a free one, waits when they are all busy, and tells you when one goes offline or needs an update.',
    points: ['Single and double elimination, round robin, Swiss', 'Shuffle tournaments with balanced teams', 'Demos uploaded after every map'],
    card: <ServersCard />,
  },
  {
    title: 'Players keep their history.',
    body: 'Ratings, stats and match history carry over from one tournament to the next, so seeding gets fairer every event.',
    card: <ProfileCard />,
  },
];

/* Split Studio: text and proof alternate sides down the page. */
export function Features() {
  return (
    <Container maxWidth="lg" id="features" sx={{ display: 'grid', gap: { xs: 10, md: 16 }, py: { xs: 10, md: 16 } }}>
      {rows.map((row, i) => (
        <Box
          component="section"
          key={row.title}
          sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) minmax(0,1.15fr)' }, gap: { xs: 4, md: 10 }, alignItems: 'center' }}
        >
          <Reveal sx={{ order: { md: i % 2 ? 2 : 0 } }}>
            <Typography variant="h2" sx={{ maxWidth: '16ch' }}>
              {row.title}
            </Typography>
            <Typography sx={{ mt: 2, color: color.ink2, maxWidth: '44ch' }}>{row.body}</Typography>
            {row.points && (
              <Box component="ul" sx={{ m: 0, mt: 3, p: 0, listStyle: 'none', display: 'grid', gap: 1, color: color.ink2, fontSize: '0.875rem' }}>
                {row.points.map((p) => (
                  <Box component="li" key={p} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, '&::before': { content: '""', width: 6, height: 6, borderRadius: '50%', bgcolor: color.accent, flex: 'none' } }}>
                    {p}
                  </Box>
                ))}
              </Box>
            )}
          </Reveal>
          <Reveal delay={120}>{row.card}</Reveal>
        </Box>
      ))}
    </Container>
  );
}

/** The homepage's short game grid: CS2 plus a handful of the manual-reporting games. Full list on /games. */
const homeGames = catalogGames.slice(0, 8);

export function Games() {
  return (
    <Container maxWidth="lg" component="section" id="games" sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 10, md: 16 } }}>
      <Box sx={{ maxWidth: '40rem', display: 'grid', gap: 2 }}>
        <Typography variant="h2">CS2 today. More games as modules.</Typography>
        <Typography sx={{ color: color.ink2 }}>
          Games plug in as modules. The CS2 module ships with the platform: the match plugin on your servers reports every round back. Every other game runs on
          manual reporting: a captain reports the score, the other captain agrees.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
          <Button variant="outlined" href="/games">
            Games we support
          </Button>
          <Button variant="outlined" href="/games/cs2">
            CS2 plugins and tools
          </Button>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))', gap: 2, mt: 6 }}>
        {homeGames.map((g) => {
          const linked = Boolean(g.tools?.length);
          return (
            <Box
              component={linked ? 'a' : 'article'}
              href={linked ? gamePath(g) : undefined}
              key={g.slug}
              sx={{
                bgcolor: color.paper2,
                border: `1px solid ${linked ? color.accent : color.rule}`,
                borderRadius: `${radius.lg}px`,
                p: 3,
                display: 'grid',
                gap: 1,
                alignContent: 'start',
                color: 'inherit',
                textDecoration: 'none',
                ...(linked && { '&:hover': { bgcolor: color.paper3 } }),
              }}
            >
              <Box sx={{ justifySelf: 'start' }}>
                <BadgeChip badge={g.badge} />
              </Box>
              <Typography variant="h3">{g.name}</Typography>
              <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>{g.line}</Typography>
            </Box>
          );
        })}
      </Box>
    </Container>
  );
}

export function Install() {
  return (
    <Container maxWidth="lg" component="section" sx={{ py: { xs: 6, md: 10 } }}>
      <Box
        sx={{
          bgcolor: color.paper2,
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.lg}px`,
          p: { xs: 3, md: 6 },
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) minmax(0,1.2fr)' },
          gap: { xs: 4, md: 6 },
          alignItems: 'center',
        }}
      >
        <div>
          <Typography variant="h2">Up in five minutes.</Typography>
          <Typography sx={{ mt: 2, color: color.ink2 }}>
            One Docker Compose file runs the web app, the API and the database. Add your Steam API key to <code>.env</code>, open http://localhost:3069 and create a tournament.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 3 }}>
            <Button variant="contained" href={links.install}>
              Read the install guide
            </Button>
            <Button variant="outlined" href={links.discord}>
              Ask on Discord
            </Button>
          </Box>
        </div>
        <CodeBlock comment="# no clone needed: download the compose file and start" code={installCommands} />
      </Box>
    </Container>
  );
}
