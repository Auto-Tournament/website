'use client';

import { useEffect, useState } from 'react';
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

/** True while the visitor is scrolling down past the top of the page. */
function useScrollingDown(threshold = 80) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        // Ignore tiny moves (trackpad jitter) so the nav doesn't flicker.
        if (Math.abs(y - last) < 6) return;
        setDown(y > last && y > threshold);
        last = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return down;
}

/* N5 floating pill: shrinks while scrolling down, grows back on scroll up. */
export function Nav() {
  const compact = useScrollingDown();
  return (
    <Box component="header" sx={{ position: 'sticky', top: 16, zIndex: 10, display: 'flex', justifyContent: 'center', px: 2 }}>
      <Box
        data-compact={compact || undefined}
        sx={{
          transform: compact ? 'translateY(-6px) scale(0.86)' : 'none',
          transformOrigin: 'top center',
          transition: `transform ${tokens.duration.base}ms ${tokens.ease.out}, background-color ${tokens.duration.base}ms ${tokens.ease.out}`,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
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
        <Box component="a" href="#top" aria-label="Auto Tournament, back to top" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit', fontFamily: fontDisplay, fontWeight: 600, whiteSpace: 'nowrap' }}>
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
    <Container maxWidth="lg" component="section" sx={{ textAlign: 'center', pt: { xs: 8, md: 12 }, pb: { xs: 4, md: 6 } }}>
      <Box
        component="img"
        src="/at-icon.svg"
        alt="Auto Tournament"
        sx={{
          display: 'block',
          width: { xs: 96, md: 128 },
          height: { xs: 96, md: 128 },
          mx: 'auto',
          mb: { xs: 4, md: 5 },
          borderRadius: { xs: '22px', md: '29px' },
          boxShadow: `0 24px 80px -20px ${color.accent}`,
        }}
      />
      <Typography variant="h1" sx={{ maxWidth: '15ch', mx: 'auto' }}>
        Ditch the spreadsheet.{' '}
        <Box component="span" sx={{ color: color.accent, textDecoration: 'underline', textDecorationThickness: '0.08em', textUnderlineOffset: '0.12em' }}>
          Enjoy
        </Box>{' '}
        the LAN.
      </Typography>
      <Typography sx={{ mt: 3, mx: 'auto', maxWidth: '58ch', color: color.ink2, fontSize: '1.125rem' }}>
        Create the tournament and add your servers. Auto Tournament runs the veto, loads every match, tracks the scores and moves the bracket on, so you can
        spend the day on the event instead of the admin. Self-hosted and open source, with CS2 built in.
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

const installCommands = `mkdir autotournament && cd autotournament
curl -fsSLO https://autotournament.gg/docker-compose.yml
cat > .env <<EOF
SESSION_SECRET=$(openssl rand -base64 32)
SERVER_TOKEN=$(openssl rand -base64 24 | tr -d '=+/')
FRONTEND_BASE_URL=http://localhost:3069
STEAM_API_KEY=
AUTH_STEAM_ENABLED=true
EOF
docker compose up -d`;

/** Wrapping code block with a copy button. Copies the commands, not the comment. */
function CodeBlock({ code, comment }: { code: string; comment?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      // The async clipboard API is blocked on plain http and in some embeds;
      // fall back to a hidden textarea and the legacy copy command.
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <Box sx={{ position: 'relative', minWidth: 0 }}>
      <Box
        component="pre"
        sx={{
          ...mono,
          m: 0,
          p: 3,
          pr: { xs: 3, sm: 11 },
          borderRadius: `${radius.md}px`,
          bgcolor: color.paper,
          border: `1px solid ${color.rule}`,
          fontSize: '0.875rem',
          lineHeight: 1.7,
          color: color.ink2,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {comment && (
          <Box component="span" sx={{ color: color.muted, display: 'block' }}>
            {comment}
          </Box>
        )}
        {code}
      </Box>
      <Button
        size="small"
        variant="outlined"
        onClick={copy}
        aria-label={copied ? 'Commands copied' : 'Copy commands'}
        sx={{ position: { xs: 'static', sm: 'absolute' }, top: 12, right: 12, mt: { xs: 1.5, sm: 0 }, minWidth: 76, bgcolor: color.paper2 }}
      >
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </Button>
    </Box>
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
