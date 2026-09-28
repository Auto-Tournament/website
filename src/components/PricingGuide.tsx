import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay, fontMono } from '@/theme/theme';
import { formatEuro, packIn, type Pack } from '@/components/pricing';

/*
 * The explaining parts of the pricing page: what each product is (a stack
 * diagram) and what the alternatives cost. No hooks, so they render on the
 * server with the page.
 */

const { color, radius } = tokens;

const underline = { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule, textUnderlineOffset: '0.15em' } as const;

/** A link that leaves the site: new tab, with an arrow. */
function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Box component="a" href={href} target="_blank" rel="noopener noreferrer" sx={{ ...underline, whiteSpace: 'nowrap' }}>
      {children} ↗
    </Box>
  );
}

type ProductNo = 1 | 2 | 3 | 4;

/** The numbered dot that ties the diagram and its legend together. */
function Marker({ n, dim = false, size = 22 }: { n: ProductNo; dim?: boolean; size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-grid',
        placeItems: 'center',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        fontFamily: fontDisplay,
        fontWeight: 700,
        fontSize: size > 20 ? '0.75rem' : '0.6875rem',
        lineHeight: 1,
        bgcolor: dim ? 'transparent' : color.accent,
        color: dim ? color.muted : color.accentInk,
        border: `1px solid ${dim ? color.rule : color.accent}`,
      }}
    >
      {n}
    </Box>
  );
}

function Tag({ children, dashed = false, strong = false }: { children: React.ReactNode; dashed?: boolean; strong?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        px: 1,
        py: 0.25,
        borderRadius: `${radius.sm}px`,
        border: `1px ${dashed ? 'dashed' : 'solid'} ${strong ? color.accent : color.rule}`,
        bgcolor: strong ? 'transparent' : color.paper2,
        color: strong ? color.ink : color.ink2,
        fontSize: '0.75rem',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

type Product = { n: ProductNo; name: string; line: string; covered: string };

const products: Product[] = [
  {
    n: 1,
    name: 'Platform',
    line: 'Your tournament’s website: sign-ups, brackets, admin and live scores. Other games plug in as game packs; CS2 is the one today.',
    covered: 'Platform pack',
  },
  { n: 2, name: 'CS2 Server Manager', line: 'Installs, updates and runs many CS2 servers on one machine.', covered: 'Servers pack, or included in Platform' },
  {
    n: 3,
    name: 'Ready Up',
    line: 'The plugin on each CS2 server that runs the match: ready-up, pauses, demos and results.',
    covered: 'Servers pack, or included in Platform',
  },
  { n: 4, name: 'MatchZy Enhanced', line: 'Our MIT CS2 match plugin. It does the same job as Ready Up, free for everyone.', covered: 'Free for any use (MIT)' },
];

/**
 * The stack: the platform on top, one machine of CS2 servers below it, a
 * match plugin on each server. Real boxes in the site's style, no fake
 * window chrome. The legend beside it carries the same words for screen
 * readers, so the drawing itself is one labelled image.
 */
export function ProductStack() {
  return (
    <Box
      component="figure"
      aria-labelledby="stack-caption"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1.05fr) minmax(0,1fr)' },
        gap: { xs: 4, md: 7 },
        alignItems: 'start',
      }}
    >
      <Box
        role="img"
        aria-label="Diagram: the platform sends matches to CS2 servers on one machine and gets scores and results back. CS2 Server Manager installs, updates and runs those servers. Each server runs one match plugin: Ready Up or MatchZy Enhanced."
        sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)' }}
      >
        <Box sx={{ bgcolor: color.paper3, border: `1px solid ${color.accent}`, borderRadius: `${radius.md}px`, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Marker n={1} />
            <Box sx={{ fontFamily: fontDisplay, fontWeight: 700 }}>Platform</Box>
            <Box sx={{ color: color.muted, fontSize: '0.8125rem', minWidth: 0 }}>your tournament’s website</Box>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {['Sign-ups', 'Brackets', 'Map veto', 'Admin', 'Live scores'].map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, color: color.muted, fontSize: '0.8125rem' }}>
            <span>Game packs:</span>
            <Tag strong>CS2</Tag>
            <Tag dashed>more planned</Tag>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', columnGap: 1.5, alignItems: 'center', pl: { xs: 2, sm: 2.5 }, py: 0.5 }}>
          <Box sx={{ justifySelf: 'center', width: 2, height: 44, bgcolor: color.rule }} />
          <Box sx={{ fontFamily: fontMono, fontSize: '0.75rem', color: color.muted }}>matches out · scores and results back</Box>
        </Box>

        <Box sx={{ border: `1px dashed ${color.muted}`, borderRadius: `${radius.md}px`, p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Marker n={2} />
            <Box sx={{ fontFamily: fontDisplay, fontWeight: 700 }}>One machine</Box>
            <Box sx={{ color: color.muted, fontSize: '0.8125rem' }}>run by CS2 Server Manager</Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', sm: 'repeat(4, minmax(0,1fr))', md: 'repeat(2, minmax(0,1fr))', lg: 'repeat(4, minmax(0,1fr))' }, gap: 1 }}>
            {[1, 2, 3, 4].map((i) => (
              <Box key={i} sx={{ bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.sm}px`, p: 1.25, display: 'grid', gap: 0.75, minWidth: 0 }}>
                <Box sx={{ fontSize: '0.8125rem', fontWeight: 600, color: color.ink }}>CS2 server {i}</Box>
                <Box sx={{ border: `1px dashed ${color.rule}`, borderRadius: `${radius.sm}px`, px: 0.75, py: 0.5, fontFamily: fontMono, fontSize: '0.6875rem', color: color.muted }}>
                  match plugin
                </Box>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, fontSize: '0.8125rem', color: color.muted }}>
            <span>Match plugin, one of:</span>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: color.ink, whiteSpace: 'nowrap' }}>
              <Marker n={3} size={20} /> Ready Up
            </Box>
            <span>or</span>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: color.ink, whiteSpace: 'nowrap' }}>
              <Marker n={4} size={20} /> MatchZy Enhanced
            </Box>
          </Box>
        </Box>
      </Box>

      <Box>
        <Box component="figcaption" id="stack-caption" sx={{ color: color.ink2, mb: 3, maxWidth: '44ch' }}>
          Three products you can license, and one plugin that is free for everyone. Each license covers the pieces marked below.
        </Box>
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 2.5 }}>
          {products.map((p) => (
            <Box component="li" key={p.n} sx={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', columnGap: 1.5, alignItems: 'start' }}>
              <Box sx={{ pt: '2px' }}>
                <Marker n={p.n} />
              </Box>
              <div>
                <Typography component="h4" sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.35 }}>
                  {p.name}
                </Typography>
                <Typography sx={{ color: color.ink2, mt: 0.25 }}>{p.line}</Typography>
                <Typography sx={{ color: p.n === 4 ? color.live : color.muted, fontSize: '0.875rem', mt: 0.5 }}>{p.covered}</Typography>
              </div>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

type Alternative = { name: string; examples: string; cost: string; body: React.ReactNode; ours: string; sources: [string, string][] };

/**
 * What the alternatives cost. Only claims from the 28 September 2026 market
 * analysis that were checked against a public source, each linked.
 */
function alternatives(packs: readonly Pack[]): Alternative[] {
  const platformM = packIn(packs, 'platform-m');
  const serversM = packIn(packs, 'servers-m');
  return [
    {
      name: 'Bracket tools',
      examples: 'Toornament, Challengermode',
      cost: 'Toornament Community: €228 a year (€19 a month, billed yearly). Challengermode Core: from €718.80 a year (€59.90 a month, billed yearly).',
      body: 'Hosted brackets and sign-ups for hundreds of games, and Toornament handles paid registration, which we don’t. Toornament doesn’t install or run your game servers, handle ready-up and pauses, or record demos.',
      ours: `Platform M is ${formatEuro(platformM.prices.year)} a year, and runs your servers as well.`,
      sources: [
        ['Toornament pricing', 'https://www.toornament.com/en_US/pricing'],
        ['Challengermode pricing', 'https://www.challengermode.com/pricing/organizers'],
      ],
    },
    {
      name: 'start.gg',
      examples: 'Registration and brackets',
      cost: 'Free for organizers. A 6% platform fee is added on top of what players pay for online registration.',
      body: '16 teams of 5 players at €25 each is €2,000 in entry fees. 6% of that is €120, paid by the players. We charge one fixed price and take no cut, but we don’t take registration payments at all.',
      ours: `Platform M for one event is ${formatEuro(platformM.prices.event)}.`,
      sources: [['start.gg, January 2025', 'https://blog.start.gg/balance-patch-january-2025-fa3f8925dcba']],
    },
    {
      name: 'Free, do it yourself',
      examples: 'MatchZy with G5API and G5V, eBot, LinuxGSM, Pterodactyl, Pelican',
      cost: 'Free, including for commercial use.',
      body: 'Good tools, and a fair choice if you have the time. You connect the pieces yourself, and keeping them working after CS2 updates is your job.',
      ours: 'Auto Tournament is free too, as long as nobody earns money from it.',
      sources: [
        ['MatchZy', 'https://github.com/shobhit-pathak/MatchZy'],
        ['G5API', 'https://github.com/PhlexPlexico/G5API'],
        ['LinuxGSM', 'https://linuxgsm.com/servers/cs2server/'],
        ['Pterodactyl', 'https://pterodactyl.io/'],
      ],
    },
    {
      name: 'Renting the servers',
      examples: 'DatHost, FACEIT',
      cost: 'DatHost: €0.33 per server-hour. FACEIT: free for organizers, on FACEIT’s own servers.',
      body: '20 servers for 3 days at 12 hours a day is 720 server-hours: €237.60 at DatHost’s rate, or about €68 at a budget host (RespawnHost, about €0.094 an hour). Either way the servers run in their data centres, not at your venue.',
      ours: `Servers M for one event is ${formatEuro(serversM.prices.event)}. Most LANs run servers on their own hardware, so this is a price anchor, not what you’d spend.`,
      sources: [
        ['DatHost', 'https://dathost.com/for-platforms'],
        ['RespawnHost', 'https://respawnhost.com/en/counter-strike-2-server-hosting/'],
        ['FACEIT, November 2023', 'https://blog.faceit.com/host-your-tournaments-for-free-on-faceit-now-for-cs2-c437b0523d1c'],
      ],
    },
  ];
}

const gaps = [
  'No paid registration or ticketing.',
  'No stream overlays. Live scores are in the browser.',
  'Ready Up is early: MatchZy Enhanced does more match work today.',
  'One game today. Bracket tools cover hundreds.',
  'CS2 needs Steam, so the venue needs internet. Your servers and match control still run there.',
];

export function Alternatives({ packs }: { packs: readonly Pack[] }) {
  const rows = alternatives(packs);
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 20rem' }, gap: { xs: 4, lg: 6 }, alignItems: 'start' }}>
      <Box component="dl" sx={{ m: 0, display: 'grid' }}>
        {rows.map((row) => (
          <Box
            key={row.name}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,15rem) minmax(0,1fr)' },
              gap: { xs: 1, md: 4 },
              py: 3,
              borderTop: `1px solid ${color.rule}`,
              '&:last-of-type': { borderBottom: `1px solid ${color.rule}` },
            }}
          >
            <Box component="dt" sx={{ m: 0 }}>
              <Box sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.125rem' }}>{row.name}</Box>
              <Box sx={{ color: color.muted, fontSize: '0.875rem', mt: 0.25 }}>{row.examples}</Box>
            </Box>
            <Box component="dd" sx={{ m: 0, display: 'grid', gap: 1, color: color.ink2 }}>
              <Typography sx={{ color: color.ink }}>{row.cost}</Typography>
              <Typography>{row.body}</Typography>
              <Typography sx={{ color: color.ink, fontWeight: 600 }}>{row.ours}</Typography>
              <Typography sx={{ color: color.muted, fontSize: '0.8125rem', display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
                <span>Sources, read 28 Sep 2026:</span>
                {row.sources.map(([label, href]) => (
                  <Out key={href} href={href}>
                    {label}
                  </Out>
                ))}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
      <Box component="aside" aria-labelledby="gaps-title" sx={{ bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, p: 3 }}>
        <Typography id="gaps-title" component="h4" sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.125rem', mb: 1.5 }}>
          Where we’re behind
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1, color: color.ink2, fontSize: '0.9375rem' }}>
          {gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
