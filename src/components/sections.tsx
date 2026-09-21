'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { Reveal, mono } from './ui';
import { BracketCard } from './cards/BracketCard';
import { VetoCard } from './cards/VetoCard';
import { ServersCard } from './cards/ServersCard';
import { ProfileCard } from './cards/ProfileCard';

const { color, radius } = tokens;

export const links = {
  install: 'https://docs.autotournament.gg/getting-started/install',
  docs: 'https://docs.autotournament.gg',
  github: 'https://github.com/Auto-Tournament',
  repo: 'https://github.com/Auto-Tournament/auto-tournament',
  discord: 'https://discord.gg/n7gHYau7aW',
};

/* N5 floating pill */
export function Nav() {
  return (
    <Box component="header" sx={{ position: 'sticky', top: 16, zIndex: 10, display: 'flex', justifyContent: 'center', px: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          maxWidth: '100%',
          py: 1,
          pr: 1,
          pl: 2,
          bgcolor: 'rgba(24, 17, 14, 0.82)',
          backdropFilter: 'blur(14px)',
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.pill}px`,
        }}
      >
        <Box component="a" href="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit', fontFamily: fontDisplay, fontWeight: 600, whiteSpace: 'nowrap' }}>
          <Box component="img" src="/at-icon.svg" alt="" sx={{ width: 26, height: 26, borderRadius: '7px' }} />
          Auto Tournament
        </Box>
        <Box component="nav" aria-label="Main" sx={{ display: { xs: 'none', md: 'flex' }, gap: 3, fontSize: '0.875rem' }}>
          {[
            ['Features', '#features'],
            ['Games', '#games'],
            ['Docs', links.docs],
            ['GitHub', links.github],
          ].map(([label, href]) => (
            <Box key={label} component="a" href={href} sx={{ color: color.ink2, textDecoration: 'none', whiteSpace: 'nowrap', '&:hover': { color: color.ink } }}>
              {label}
            </Box>
          ))}
        </Box>
        <Button variant="contained" size="small" href={links.install}>
          Install
        </Button>
      </Box>
    </Box>
  );
}

export function Hero() {
  return (
    <Container maxWidth="lg" component="section" sx={{ textAlign: 'center', pt: { xs: 10, md: 16 }, pb: { xs: 4, md: 6 } }}>
      <Typography variant="h1" sx={{ maxWidth: '14ch', mx: 'auto' }}>
        Run the tournament.{' '}
        <Box component="span" sx={{ color: color.accent, textDecoration: 'underline', textDecorationThickness: '0.08em', textUnderlineOffset: '0.12em' }}>
          Skip
        </Box>{' '}
        the spreadsheet.
      </Typography>
      <Typography sx={{ mt: 3, mx: 'auto', maxWidth: '56ch', color: color.ink2, fontSize: '1.125rem' }}>
        Auto Tournament builds the bracket, runs the map veto, puts every match on a free server and records the result. Self-hosted and open source, with
        CS2 built in.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1.5, mt: 4 }}>
        <Button variant="contained" href={links.install}>
          Install Auto Tournament
        </Button>
        <Button variant="outlined" href={links.repo}>
          View on GitHub
        </Button>
      </Box>
      <Box
        component="figure"
        aria-label="Product preview"
        sx={{
          m: 0,
          mt: { xs: 6, md: 10 },
          mx: 'auto',
          width: 'min(64rem, 100%)',
          aspectRatio: '16 / 9',
          borderRadius: `${radius.lg}px`,
          overflow: 'hidden',
          border: `1px solid ${color.rule}`,
          bgcolor: color.paper2,
          position: 'relative',
          boxShadow: `0 40px 120px -40px ${color.accent}`,
        }}
      >
        {/* Replace with the real recording: public/preview.mp4 + poster. */}
        <Box component="figcaption" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 3, color: color.muted, fontSize: '0.875rem' }}>
          <span>
            <Box component="strong" sx={{ display: 'block', color: color.ink, fontFamily: fontDisplay, fontSize: '1.375rem', mb: 0.5 }}>
              Product preview
            </Box>
            90-second recording of a tournament from bracket to final. To record.
          </span>
        </Box>
      </Box>
      <Typography sx={{ mt: 2, color: color.muted, fontSize: '0.875rem' }}>Free and MIT licensed · Runs on one Docker host</Typography>
    </Container>
  );
}

type Row = { title: string; body: string; points?: string[]; card: React.ReactNode };

const rows: Row[] = [
  {
    title: 'The bracket moves on by itself.',
    body: "When a match ends, the winner goes through and the next match is set up. You watch; you don't copy scores.",
    points: ['Single and double elimination', 'Round robin and Swiss', 'Shuffle tournaments with balanced teams'],
    card: <BracketCard />,
  },
  {
    title: 'Map veto in the browser.',
    body: 'Team captains ban and pick maps from their phone. When the veto is done, the server loads the right maps and sides.',
    points: ['Bo1, Bo3 and Bo5 formats', 'Knife round or side pick', 'Custom veto order per tournament'],
    card: <VetoCard />,
  },
  {
    title: 'Every match finds a server.',
    body: 'Add your game servers once. Auto Tournament loads each match on a free one, waits when they are all busy, and tells you when one goes offline or needs an update.',
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

const games = [
  { name: 'Counter-Strike 2', note: 'Your own servers with MatchZy Enhanced. Veto, live scores, demos and stats.', built: true },
  { name: 'Team Fortress 2', note: 'Self-hosted servers, same model as CS2.' },
  { name: 'Dota 2', note: 'Lobbies created by a bot, results from the Steam Web API.' },
  { name: 'League of Legends', note: "Tournament codes and results through Riot's Tournament API." },
  { name: 'Trackmania', note: 'Dedicated servers you host, plus the Nadeo API.' },
  { name: 'osu!', note: 'Multiplayer lobbies run by a bot, results from the osu! API.' },
  { name: 'Chess', note: 'Games and results through the open Lichess API.' },
  { name: 'Any other game', note: 'Manual result reporting for games without an API.' },
];

export function Games() {
  return (
    <Container maxWidth="lg" component="section" id="games" sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 10, md: 16 } }}>
      <Box sx={{ maxWidth: '40rem', display: 'grid', gap: 2 }}>
        <Typography variant="h2">CS2 today. More games as modules.</Typography>
        <Typography sx={{ color: color.ink2 }}>
          Games plug in as modules. CS2 ships built in. The rest are planned, starting with games that let you host servers or run lobbies through an API.
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))', gap: 2, mt: 6 }}>
        {games.map((g) => (
          <Box
            component="article"
            key={g.name}
            sx={{ bgcolor: color.paper2, border: `1px solid ${g.built ? color.accent : color.rule}`, borderRadius: `${radius.lg}px`, p: 3, display: 'grid', gap: 1, alignContent: 'start' }}
          >
            <Chip size="small" color={g.built ? 'primary' : 'default'} label={g.built ? 'Built in' : 'Planned'} sx={{ justifySelf: 'start' }} />
            <Typography variant="h3">{g.name}</Typography>
            <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>{g.note}</Typography>
          </Box>
        ))}
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
            One Docker Compose file: the web app, the API and the database. Point it at your servers and create a tournament.
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
        <Box
          component="pre"
          sx={{ ...mono, m: 0, p: 3, borderRadius: `${radius.md}px`, bgcolor: color.paper, border: `1px solid ${color.rule}`, overflowX: 'auto', fontSize: '0.875rem', lineHeight: 1.7, color: color.ink2 }}
        >
          <Box component="span" sx={{ color: color.muted }}>
            # clone and start
          </Box>
          {`
git clone https://github.com/Auto-Tournament/auto-tournament.git
cd auto-tournament
cp example.env .env
docker compose -f docker/docker-compose.yml up -d`}
        </Box>
      </Box>
    </Container>
  );
}

/* Ft5 statement */
export function Footer() {
  return (
    <Container maxWidth="lg" component="footer" sx={{ pt: { xs: 10, md: 16 }, pb: 6, mt: 6, borderTop: `1px solid ${color.rule}` }}>
      <Typography sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 'clamp(1.9rem, 2.2vw + 1rem, 2.75rem)', letterSpacing: '-0.03em', lineHeight: 1.1, maxWidth: '20ch' }}>
        Made by people who run LANs, for people who run LANs.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 2, mt: 6, color: color.muted, fontSize: '0.875rem' }}>
        <Box component="nav" aria-label="Footer" sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {[
            ['Docs', links.docs],
            ['GitHub', links.github],
            ['Discord', links.discord],
          ].map(([label, href]) => (
            <Box key={label} component="a" href={href} sx={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap', '&:hover': { color: color.ink } }}>
              {label}
            </Box>
          ))}
        </Box>
        <span>MIT licensed · Logo generated with an AI image model, cleaned up by hand</span>
      </Box>
    </Container>
  );
}
