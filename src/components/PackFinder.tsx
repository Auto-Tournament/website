'use client';

/*
 * Hallmark · component: stepped guide (fieldset per question, result card)
 * genre: modern-minimal · theme: Auto Tournament system (src/theme/tokens.ts, Sora + Geist)
 * states: default · hover · focus · active · disabled · loading · error · success
 * pre-emit critique: P4 H5 E4 S5 R4 V4
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import {
  earnMoneyRule,
  formatEuro,
  founderBadge,
  founderLifetime,
  freeOrganizations,
  freeUseHelp,
  maxPackServers,
  packFor,
  periodLabels,
  vatShort,
  type Pack,
  type Period,
} from '@/components/pricing';
import {
  answerFields,
  checkoutPayload,
  cs2,
  effectiveJob,
  featuredGameSlugs,
  gameIcon,
  gameName,
  headline,
  isAnswered,
  jobOptions,
  nextStep,
  otherGame,
  packGames,
  parseAnswers,
  previousStep,
  priceTip,
  recommend,
  resolveStep,
  serversCap,
  serversFromTeams,
  stepShort,
  stepTitles,
  stepsFor,
  toQuery,
  whyThisSize,
  type Answers,
  type Context,
  type Job,
  type Recommendation,
  type StepId,
} from '@/components/findPack';
import { links } from '@/components/links';
import { seller } from '@/components/seller';
import { FreeLanConfirmation } from '@/components/FreeLanConfirmation';
import { startCheckout } from '@/lib/startCheckout';

const { color, radius, ease, duration } = tokens;

const cs2PluginRepo = 'https://github.com/Auto-Tournament/cs2-plugin';

const underline = { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule, textUnderlineOffset: '0.15em' } as const;

/** Buttons in the guide keep their label on one line. */
const oneLine = { whiteSpace: 'nowrap' } as const;

const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/* ------------------------------------------------------------ choice tile */

/**
 * A checkbox or radio drawn as a big tile. The real input is visually
 * hidden inside the label, so clicks, Space, arrow keys and screen readers
 * all work natively; the visible tile is its next sibling.
 */
function Tile({
  type,
  name,
  value,
  checked,
  onChange,
  children,
  indicator = true,
  describedBy,
  label,
}: {
  type: 'checkbox' | 'radio';
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  indicator?: boolean;
  describedBy?: string;
  /** A short accessible name when the tile's text is long or has extras. */
  label?: string;
}) {
  return (
    <Box
      component="label"
      sx={{
        position: 'relative',
        display: 'block',
        minWidth: 0,
        cursor: 'pointer',
        // Visually hidden but still a real input: clicking the label toggles it, and keyboards and screen readers use it natively.
        '& > input': { position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 },
        '& > .tile': {
          display: 'grid',
          gridTemplateColumns: indicator ? 'minmax(0,1fr) 20px' : 'minmax(0,1fr)',
          alignItems: 'center',
          gap: 1.5,
          height: '100%',
          minHeight: 56,
          px: 2,
          py: 1.5,
          bgcolor: color.paper2,
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.md}px`,
          transition: `border-color ${duration.fast}ms ${ease.out}, background-color ${duration.fast}ms ${ease.out}`,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        },
        '&:hover > .tile': { borderColor: color.muted },
        '&:active > .tile': { bgcolor: color.paper3 },
        '& > input:checked + .tile': { borderColor: color.accent, bgcolor: color.paper3 },
        '& > input:focus-visible + .tile': { outline: `2px solid ${color.focus}`, outlineOffset: 2 },
        '& > input:disabled + .tile': { opacity: 0.5 },
        '& .ind': {
          width: 20,
          height: 20,
          borderRadius: type === 'radio' ? '50%' : `${radius.sm - 3}px`,
          border: `1.5px solid ${color.muted}`,
          display: 'grid',
          placeItems: 'center',
          justifySelf: 'end',
        },
        '& > input:checked + .tile .ind': { borderColor: color.accent, bgcolor: color.accent },
        '& > input:checked + .tile .ind::after':
          type === 'radio'
            ? { content: '""', width: 8, height: 8, borderRadius: '50%', bgcolor: color.accentInk }
            : { content: '""', width: 5, height: 10, mt: '-2px', borderRight: `2px solid ${color.accentInk}`, borderBottom: `2px solid ${color.accentInk}`, transform: 'rotate(45deg)' },
      }}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        aria-describedby={describedBy}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Box component="span" className="tile">
        <Box component="span" sx={{ minWidth: 0 }}>
          {children}
        </Box>
        {indicator && <Box component="span" className="ind" aria-hidden />}
      </Box>
    </Box>
  );
}

function GameIcon({ slug, size }: { slug: string; size: number }) {
  const src = gameIcon(slug);
  if (!src) {
    return (
      <Box
        component="span"
        aria-hidden
        sx={{ width: size, height: size, flex: 'none', borderRadius: `${radius.sm}px`, border: `1px dashed ${color.muted}`, display: 'grid', placeItems: 'center', color: color.muted, fontWeight: 700 }}
      >
        +
      </Box>
    );
  }
  return <Box component="img" src={src} alt="" width={size} height={size} loading="lazy" sx={{ flex: 'none', borderRadius: `${radius.sm}px`, display: 'block' }} />;
}

function OptionText({ title, line, badge }: { title: string; line?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'grid', gap: 0.25 }}>
      <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5, fontWeight: 600, color: color.ink }}>
        {title}
        {badge}
      </Box>
      {line && (
        <Box component="span" sx={{ color: color.ink2, fontSize: '0.9375rem' }}>
          {line}
        </Box>
      )}
    </Box>
  );
}

function Badge({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'free' }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        px: 0.75,
        py: 0.125,
        borderRadius: `${radius.sm}px`,
        border: `1px solid ${tone === 'free' ? color.live : color.rule}`,
        color: tone === 'free' ? color.live : color.ink2,
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

/* ------------------------------------------------------------------ steps */

function GamesStep({ draft, setDraft }: { draft: Answers; setDraft: (a: Answers) => void }) {
  const toggle = (slug: string, on: boolean) =>
    setDraft({ ...draft, games: on ? [...draft.games, slug] : draft.games.filter((g) => g !== slug) });
  const featured = packGames.filter((g) => featuredGameSlugs.includes(g.slug));
  const rest = packGames.filter((g) => !featuredGameSlugs.includes(g.slug));
  const restPicked = rest.some((g) => draft.games.includes(g.slug));
  const smallTile = (slug: string, name: string) => (
    <Tile key={slug} type="checkbox" name="g" value={slug} label={name} checked={draft.games.includes(slug)} onChange={(on) => toggle(slug, on)}>
      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        <GameIcon slug={slug} size={28} />
        <Box component="span" sx={{ minWidth: 0, color: color.ink, fontWeight: 500, overflowWrap: 'anywhere' }}>
          {name}
        </Box>
      </Box>
    </Tile>
  );
  const grid = { display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 13.5rem), 1fr))' } as const;

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      <Typography sx={{ color: color.ink2 }}>Pick every game you plan to run. You can pick more than one.</Typography>
      <Tile type="checkbox" name="g" value={cs2.slug} label={`${cs2.name}, full support`} checked={draft.games.includes(cs2.slug)} onChange={(on) => toggle(cs2.slug, on)}>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.75, minWidth: 0 }}>
          <GameIcon slug={cs2.slug} size={44} />
          <OptionText title={cs2.name} line="Your game servers, the match plugin and the platform." badge={<Badge>Full support</Badge>} />
        </Box>
      </Tile>

      <Box sx={{ display: 'grid', gap: 1.25 }}>
        <Typography id="other-games-note" sx={{ color: color.muted, fontSize: '0.875rem' }}>
          Other games run on the platform: sign-ups and brackets, and the teams report each result by hand. Needs Auto Tournament 3.0, in beta now.
        </Typography>
        <Box sx={grid}>
          {featured.map((g) => smallTile(g.slug, g.name))}
          {smallTile(otherGame, 'Another game')}
        </Box>
        <Box
          component="details"
          open={restPicked || undefined}
          sx={{
            '& > summary': {
              cursor: 'pointer',
              color: color.ink,
              fontWeight: 600,
              fontSize: '0.9375rem',
              py: 1,
              width: 'fit-content',
              textDecoration: 'underline',
              textDecorationColor: color.rule,
              textUnderlineOffset: '0.2em',
            },
            '& > summary:hover': { color: color.accent },
          }}
        >
          <summary>Show all {packGames.length} games</summary>
          <Box sx={{ ...grid, mt: 1 }}>{rest.map((g) => smallTile(g.slug, g.name))}</Box>
        </Box>
      </Box>

      {draft.games.includes(otherGame) && (
        <Note>
          Not in the list? The platform can often still run it, with the teams reporting results by hand.{' '}
          <Box component="a" href={`${links.contact}?topic=other`} sx={underline}>
            Tell us which game
          </Box>{' '}
          and we&apos;ll check, or add a game pack for it.
        </Note>
      )}
    </Box>
  );
}

const jobCopy: Record<Job, { title: string; line: string }> = {
  plugin: { title: 'Just run my CS2 matches', line: 'Ready-up, pauses, demos and results on servers you already run.' },
  servers: { title: 'Set up and run my CS2 game servers', line: 'Install, update and run many CS2 servers from one machine, with a match plugin on each.' },
  platform: { title: 'Run the whole tournament', line: 'Sign-ups, brackets, map veto, live scores, and the servers too.' },
};

function JobStep({ draft, setDraft }: { draft: Answers; setDraft: (a: Answers) => void }) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {jobOptions(draft).map((job) => (
        <Tile key={job} type="radio" name="do" value={job} checked={draft.job === job} onChange={() => setDraft({ ...draft, job })}>
          <OptionText title={jobCopy[job].title} line={jobCopy[job].line} badge={job === 'plugin' ? <Badge tone="free">Free</Badge> : undefined} />
        </Tile>
      ))}
    </Box>
  );
}

function MoneyStep({ draft, setDraft }: { draft: Answers; setDraft: (a: Answers) => void }) {
  const options = [
    { value: 'no', title: 'No', line: 'All entry fees and sponsor money go back into the event, and nobody is paid.' },
    { value: 'yes', title: 'Yes', line: "Entry fees make a profit, you're a business, or someone is paid to run it." },
    { value: 'unsure', title: 'Not sure', line: 'See what counts.' },
  ] as const;
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {options.map((o) => (
        <Tile key={o.value} type="radio" name="money" value={o.value} checked={draft.money === o.value} onChange={() => setDraft({ ...draft, money: o.value })}>
          <OptionText title={o.title} line={o.line} />
        </Tile>
      ))}
      {draft.money === 'unsure' && (
        <Note>
          <Box component="span" sx={{ display: 'block', color: color.ink, fontWeight: 600, mb: 0.75 }}>
            It&apos;s free when nobody earns money from it.
          </Box>
          <Box component="ul" sx={{ m: 0, pl: 2.25, display: 'grid', gap: 0.75 }}>
            <li>
              <strong>Free:</strong> a volunteer LAN that charges entry, where every euro goes back into the event and nobody is paid.
            </li>
            <li>
              <strong>Free:</strong> {freeOrganizations}
            </li>
            <li>
              <strong>Pay:</strong> {earnMoneyRule}
            </li>
          </Box>
          <Box component="span" sx={{ display: 'block', mt: 1 }}>
            Then pick Yes or No above. The{' '}
            <Box component="a" href={links.terms} sx={underline}>
              license terms
            </Box>{' '}
            have the exact wording.
          </Box>
        </Note>
      )}
    </Box>
  );
}

function ServersStep({ draft, setDraft, packs }: { draft: Answers; setDraft: (a: Answers) => void; packs: readonly Pack[] }) {
  const max = maxPackServers(packs);
  const [text, setText] = useState(draft.servers !== undefined ? String(draft.servers) : '');
  const [teams, setTeams] = useState('16');
  const set = (n: number) => {
    const v = Math.min(Math.max(1, n), serversCap);
    setText(String(v));
    setDraft({ ...draft, servers: v });
  };
  const current = Number.parseInt(text, 10);
  const teamsNum = Number.parseInt(teams, 10);
  const fromTeams = Number.isInteger(teamsNum) && teamsNum >= 2 ? serversFromTeams(teamsNum) : null;
  const stepButton = {
    minWidth: 0,
    width: 48,
    height: 48,
    p: 0,
    borderRadius: `${radius.md}px`,
    fontSize: '1.375rem',
    lineHeight: 1,
  } as const;

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button variant="outlined" type="button" aria-label="One fewer server" onClick={() => set((Number.isInteger(current) ? current : 1) - 1)} sx={stepButton}>
          −
        </Button>
        <Box
          component="input"
          id="servers-input"
          name="servers"
          type="number"
          inputMode="numeric"
          min={1}
          max={serversCap}
          step={1}
          value={text}
          aria-describedby="servers-help"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setText(e.target.value);
            const n = Number.parseInt(e.target.value, 10);
            setDraft({ ...draft, servers: Number.isInteger(n) && n >= 1 ? Math.min(n, serversCap) : undefined });
          }}
          sx={{
            width: 96,
            height: 48,
            textAlign: 'center',
            fontFamily: fontDisplay,
            fontWeight: 700,
            fontSize: '1.5rem',
            color: color.ink,
            bgcolor: color.paper2,
            border: `1px solid ${color.rule}`,
            borderRadius: `${radius.md}px`,
            MozAppearance: 'textfield',
            '&::-webkit-inner-spin-button, &::-webkit-outer-spin-button': { WebkitAppearance: 'none', m: 0 },
            '&:hover': { borderColor: color.muted },
            '&:focus-visible': { outline: `2px solid ${color.focus}`, outlineOffset: 2, borderColor: color.accent },
          }}
        />
        <Button variant="outlined" type="button" aria-label="One more server" onClick={() => set((Number.isInteger(current) ? current : 0) + 1)} sx={stepButton}>
          +
        </Button>
        <Box component="label" htmlFor="servers-input" sx={{ color: color.ink2, ml: 0.5 }}>
          servers
        </Box>
      </Box>
      <Typography id="servers-help" sx={{ color: color.ink2, maxWidth: '60ch' }}>
        The most CS2 servers set up at the same time. Count spares and practice servers too. Only servers running our software count; test servers are free.
      </Typography>
      {Number.isInteger(current) && current > max && (
        <Note>More than {max} is more than our biggest pack. Go on and we&apos;ll price it with you.</Note>
      )}

      <Box
        component="details"
        sx={{
          '& > summary': { cursor: 'pointer', color: color.ink, fontWeight: 600, width: 'fit-content', py: 0.5, textDecoration: 'underline', textDecorationColor: color.rule, textUnderlineOffset: '0.2em' },
          '& > summary:hover': { color: color.accent },
        }}
      >
        <summary>Not sure? Work it out from teams</summary>
        <Box sx={{ mt: 1.5, display: 'grid', gap: 1.5, maxWidth: '60ch' }}>
          <Typography sx={{ color: color.ink2, fontSize: '0.9375rem' }}>
            In the first round every team plays at once, so you need a server for each match, plus a spare or two. 16 teams play 8 matches: 8 + 2 spares = 10
            servers.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
            <Box component="label" htmlFor="teams-input" sx={{ color: color.ink2 }}>
              Teams
            </Box>
            <Box
              component="input"
              id="teams-input"
              type="number"
              inputMode="numeric"
              min={2}
              value={teams}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTeams(e.target.value)}
              sx={{
                width: 80,
                height: 44,
                textAlign: 'center',
                fontSize: '1rem',
                color: color.ink,
                bgcolor: color.paper2,
                border: `1px solid ${color.rule}`,
                borderRadius: `${radius.md}px`,
                '&:focus-visible': { outline: `2px solid ${color.focus}`, outlineOffset: 2 },
              }}
            />
            {fromTeams && (
              <Button variant="outlined" size="small" type="button" onClick={() => set(fromTeams.total)} sx={oneLine}>
                Use {fromTeams.total} servers
              </Button>
            )}
          </Box>
          {fromTeams && (
            <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>
              {fromTeams.matches} match{fromTeams.matches === 1 ? '' : 'es'} at once + {fromTeams.spares} spare{fromTeams.spares === 1 ? '' : 's'} ={' '}
              {fromTeams.total} servers
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function FreqStep({ draft, setDraft, ctx }: { draft: Answers; setDraft: (a: Answers) => void; ctx: Context }) {
  const job = effectiveJob(draft);
  const product = job === 'servers' ? 'servers' : 'platform';
  const servers = draft.games.includes(cs2.slug) ? (draft.servers ?? 1) : 1;
  const pack = packFor(ctx.packs, product, servers);
  const options: { value: Period; title: string; line: string; price: string; badge?: React.ReactNode }[] = [
    { value: 'event', title: 'One event', line: 'Up to 5 days in a row.', price: pack ? formatEuro(pack.prices.event) : '' },
    { value: 'year', title: 'Several events or all year', line: '12 months, as many events as you like. Never renews by itself.', price: pack ? `${formatEuro(pack.prices.year)} a year` : '' },
  ];
  if (ctx.founderOpen) {
    options.push({
      value: 'founder',
      title: 'Support the project early',
      line: 'Founding supporter: pay once, lifetime updates.',
      price: pack ? `${formatEuro(pack.prices.founder)} once` : '',
      badge: <Badge>{founderBadge}</Badge>,
    });
  }
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {options.map((o) => (
        <Tile key={o.value} type="radio" name="freq" value={o.value} checked={draft.freq === o.value} onChange={() => setDraft({ ...draft, freq: o.value })}>
          <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 2, rowGap: 0.5 }}>
            <OptionText title={o.title} line={o.line} badge={o.badge} />
            <Box component="span" sx={{ fontFamily: fontDisplay, fontWeight: 700, color: color.ink, whiteSpace: 'nowrap' }}>
              {o.price}
            </Box>
          </Box>
        </Tile>
      ))}
      {pack && (
        <Typography sx={{ color: color.muted, fontSize: '0.875rem', mt: 0.5 }}>
          Prices for {pack.name}, {vatShort}.
        </Typography>
      )}
    </Box>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        bgcolor: color.paper3,
        border: `1px solid ${color.rule}`,
        borderLeft: `3px solid ${color.accent}`,
        borderRadius: `${radius.md}px`,
        p: 2,
        color: color.ink2,
        fontSize: '0.9375rem',
        maxWidth: '64ch',
      }}
    >
      {children}
    </Box>
  );
}

/* ----------------------------------------------------------------- result */

const productCovers = {
  servers: 'CS2 Server Manager and Ready Up: install, update and run your CS2 servers, with the match plugin on each.',
  platform: 'The whole platform: sign-ups, brackets, admin and live scores, with CS2 Server Manager, Ready Up and every game pack included.',
} as const;

const periodCovers: Record<Period, string> = {
  event: 'One event, up to 5 days in a row.',
  year: '12 months, as many events as you like. Never renews by itself.',
  founder: `Pay once. Lifetime updates, ${founderLifetime}.`,
};

function PackResult({
  rec,
  answers,
  pricesAvailable,
}: {
  rec: Extract<Recommendation, { kind: 'pack' }>;
  answers: Answers;
  pricesAvailable: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardOff, setCardOff] = useState(!pricesAvailable);

  useEffect(() => {
    // Back from Stripe via the bfcache: the button may still show its loading label.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setLoading(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const buy = async () => {
    if (loading || cardOff) return;
    setLoading(true);
    setError(null);
    const result = await startCheckout(checkoutPayload(rec));
    if (!result.ok) {
      if (result.cardOff) setCardOff(true);
      setError(result.error);
      setLoading(false);
    }
    // On success the browser is on its way to Stripe; stay loading.
  };

  const mailHref = (() => {
    const subject = `License request: ${rec.pack.name}, ${periodLabels[rec.period]}`;
    const lines = [
      `Pack: ${rec.pack.name} (up to ${rec.pack.maxServers} servers)`,
      `Games: ${answers.games.map(gameName).join(', ')}`,
      `Period: ${periodLabels[rec.period]}`,
      ...(rec.countsServers ? [`Servers, spares included: ${rec.servers}`] : []),
      `Price: ${formatEuro(rec.price)} ${vatShort}.`,
      '',
      'Name / company: ',
      'Org number / VAT ID: ',
      'Country and billing address: ',
      'Contact phone: ',
      'Event name: ',
      'Event date(s): ',
      'Venue or city: ',
      'Event website or social link: ',
    ];
    return `mailto:${seller.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  })();

  const tip = priceTip(rec);
  const sizeLine = rec.countsServers
    ? `Up to ${rec.pack.maxServers} game servers at once, spares included.`
    : `Up to ${rec.pack.maxServers} CS2 servers at once, if you add CS2 later. Your games need none.`;

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      <div>
        <Typography sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: { xs: '1.625rem', sm: '2rem' }, lineHeight: 1.15, letterSpacing: '-0.02em', color: color.ink }} data-testid="guide-headline">
          {headline(rec)}
        </Typography>
        <Typography sx={{ color: color.muted, fontSize: '0.875rem', mt: 0.5 }}>Prices in EUR, {vatShort}.</Typography>
      </div>

      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1, color: color.ink2 }}>
        {[productCovers[rec.product], sizeLine, periodCovers[rec.period]].map((line) => (
          <Box
            component="li"
            key={line}
            sx={{
              display: 'grid',
              gridTemplateColumns: '16px minmax(0,1fr)',
              columnGap: 1,
              '&::before': { content: '"+"', color: color.live, fontWeight: 700, lineHeight: 1.55 },
            }}
          >
            {line}
          </Box>
        ))}
      </Box>

      <Typography sx={{ color: color.ink2 }}>
        <Box component="strong" sx={{ color: color.ink, fontWeight: 600 }}>
          Why this size:
        </Box>{' '}
        {whyThisSize(rec, answers)}
      </Typography>

      {tip && <Note>{tip}</Note>}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
        {cardOff ? (
          <Button variant="contained" href={mailHref} data-testid="guide-request-email" sx={oneLine}>
            Request by email
          </Button>
        ) : (
          <Button variant="contained" onClick={buy} disabled={loading} aria-busy={loading} data-testid="guide-buy" sx={oneLine}>
            {loading ? 'Opening checkout…' : `Buy · ${formatEuro(rec.price)}`}
          </Button>
        )}
        <Button variant="outlined" href={`#packs-${rec.product}`} sx={oneLine}>
          Compare all packs
        </Button>
        <Button variant="text" href={`${links.contact}?topic=quote`} sx={{ ...oneLine, color: color.ink }}>
          Ask us
        </Button>
      </Box>

      {error && (
        <Typography role="alert" sx={{ color: color.ban, fontSize: '0.875rem' }}>
          {error}
        </Typography>
      )}

      <Typography sx={{ color: color.muted, fontSize: '0.8125rem', maxWidth: '70ch' }}>
        {cardOff
          ? "Card payment isn't available right now, so request it by email and we'll send an invoice. "
          : 'Secure checkout by Stripe, with an invoice. '}
        We check every order before sending the license. For businesses and organizations only. By paying you accept the{' '}
        <Box component="a" href={links.terms} sx={underline}>
          Commercial License Terms
        </Box>{' '}
        and{' '}
        <Box component="a" href={links.termsOfSale} sx={underline}>
          Terms of Sale
        </Box>
        .
      </Typography>
    </Box>
  );
}

function Result({ rec, answers, pricesAvailable }: { rec: Recommendation; answers: Answers; pricesAvailable: boolean }) {
  if (rec.kind === 'pack') return <PackResult rec={rec} answers={answers} pricesAvailable={pricesAvailable} />;

  const big = { fontFamily: fontDisplay, fontWeight: 700, fontSize: { xs: '1.625rem', sm: '2rem' }, lineHeight: 1.15, letterSpacing: '-0.02em', color: color.ink } as const;

  if (rec.kind === 'free-plugin') {
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Typography sx={big} data-testid="guide-headline">
          Free · MatchZy Enhanced
        </Typography>
        <Typography sx={{ color: color.ink2, maxWidth: '64ch' }}>
          Our CS2 match plugin runs ready-up, pauses, demos and results on servers you already have. It&apos;s MIT licensed: free for any use, paid work
          included. No license and no sign-up.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
          <Button variant="contained" href={cs2PluginRepo} target="_blank" rel="noopener noreferrer" sx={oneLine}>
            Get the plugin ↗
          </Button>
          <Button variant="outlined" href="#packs" sx={oneLine}>
            Compare all packs
          </Button>
          <Button variant="text" href={links.contact} sx={{ ...oneLine, color: color.ink }}>
            Ask us
          </Button>
        </Box>
      </Box>
    );
  }

  if (rec.kind === 'free') {
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Typography sx={big} data-testid="guide-headline">
          Free for you
        </Typography>
        <Typography sx={{ color: color.ink2, maxWidth: '64ch' }}>
          {freeUseHelp} No license, no payment and no registration. If that changes, for example the event makes a profit or someone gets paid, you&apos;d need a
          pack.
        </Typography>
        <FreeLanConfirmation compact headingLevel="h3" />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
          <Button variant="contained" href={links.install} target="_blank" rel="noopener noreferrer" sx={oneLine}>
            Install it ↗
          </Button>
          <Button variant="text" href={links.contact} sx={{ ...oneLine, color: color.ink }}>
            Ask us
          </Button>
        </Box>
      </Box>
    );
  }

  if (rec.kind === 'quote') {
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Typography sx={big} data-testid="guide-headline">
          {rec.servers} servers · let&apos;s price it together
        </Typography>
        <Typography sx={{ color: color.ink2, maxWidth: '64ch' }}>
          Our biggest pack covers {rec.max} game servers at once. Tell us about your setup and we&apos;ll send you a quote.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
          <Button variant="contained" href={`${links.contact}?topic=quote`} sx={oneLine}>
            Ask for a quote
          </Button>
          <Button variant="outlined" href="#packs" sx={oneLine}>
            Compare all packs
          </Button>
        </Box>
      </Box>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ guide */

const jobShort: Record<Job, string> = { plugin: 'Just the matches', servers: 'Run my servers', platform: 'The whole tournament' };

function answerText(step: StepId, a: Answers): string {
  switch (step) {
    case 'games': {
      const names = a.games.map(gameName);
      return names.length > 3 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
    }
    case 'job': {
      const job = effectiveJob(a);
      return job ? jobShort[job] : '';
    }
    case 'money':
      return a.money === 'yes' ? 'Someone earns money' : 'Nobody earns money';
    case 'servers':
      return `${a.servers} server${a.servers === 1 ? '' : 's'}`;
    case 'freq':
      return a.freq === 'event' ? 'One event' : a.freq === 'year' ? 'Yearly' : 'Founding supporter';
    default:
      return '';
  }
}

const heldHint: Record<StepId, string> = {
  games: 'Pick at least one game to go on.',
  job: 'Pick one to go on.',
  money: 'Pick Yes or No to go on.',
  servers: 'Enter how many servers, 1 or more.',
  freq: 'Pick one to go on.',
  result: '',
};

/**
 * The pricing guide: one question per step, ending with one answer. It is a
 * plain GET form, so without JavaScript each Next reloads the page on the
 * next step (the server reads the same query). With JavaScript it stays on
 * the page, and the answers still go into the URL.
 */
export function PackFinder({
  packs,
  pricesAvailable,
  founderOpen,
  initial,
}: {
  packs: readonly Pack[];
  pricesAvailable: boolean;
  founderOpen: boolean;
  initial: { answers: Answers; at?: StepId };
}) {
  const ctx: Context = { packs, founderOpen };
  const [state, setState] = useState(initial);
  const [moved, setMoved] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { answers, at } = state;
  const view = resolveStep(answers, ctx, at);
  const step = view.step;
  const [draft, setDraft] = useState<Answers>(answers);
  const [draftFor, setDraftFor] = useState(`${step}|${toQuery(answers)}`);
  // A new step (or new answers) starts its inputs from the saved answers.
  const draftKey = `${step}|${toQuery(answers)}`;
  if (draftKey !== draftFor) {
    setDraftFor(draftKey);
    setDraft(answers);
  }

  const go = useCallback((next: { answers: Answers; at?: StepId }, push = true) => {
    setState(next);
    setMoved((n) => n + 1);
    if (push) {
      const query = toQuery(next.answers, next.at);
      window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}#guide`);
    }
  }, []);

  useEffect(() => {
    const onPop = () => go(parseAnswers(new URLSearchParams(window.location.search)), false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [go]);

  // Focus the new step's heading after a move (never on first load).
  useEffect(() => {
    if (moved === 0) return;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'nearest' });
  }, [moved]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === 'string') params.append(key, value);
    });
    if (submitter?.name) params.set(submitter.name, submitter.value);
    go(parseAnswers(params));
  };

  const steps = stepsFor(answers, ctx);
  const questions: StepId[] = steps.filter((s) => s !== 'result');
  const index = questions.indexOf(step);
  const prev = previousStep(answers, ctx, step);
  const answered = steps.filter((s) => s !== 'result' && s !== step && steps.indexOf(s) < steps.indexOf(step) && isAnswered(s, answers, ctx));
  const rec = step === 'result' ? recommend(answers, ctx) : null;
  const liveText =
    rec?.kind === 'pack'
      ? `Your answer: ${headline(rec)}`
      : rec?.kind === 'free-plugin'
        ? 'Your answer: free, with MatchZy Enhanced'
        : rec?.kind === 'free'
          ? 'Your answer: free'
          : rec?.kind === 'quote'
            ? 'Your answer: contact us for a quote'
            : '';

  const title = step === 'result' ? stepTitles.result : stepTitles[step];

  const body =
    step === 'games' ? (
      <GamesStep draft={draft} setDraft={setDraft} />
    ) : step === 'job' ? (
      <JobStep draft={draft} setDraft={setDraft} />
    ) : step === 'money' ? (
      <MoneyStep draft={draft} setDraft={setDraft} />
    ) : step === 'servers' ? (
      <ServersStep key={toQuery(answers)} draft={draft} setDraft={setDraft} packs={packs} />
    ) : step === 'freq' ? (
      <FreqStep draft={draft} setDraft={setDraft} ctx={ctx} />
    ) : rec ? (
      <Result rec={rec} answers={answers} pricesAvailable={pricesAvailable} />
    ) : null;

  const heading = (
    <Typography
      ref={headingRef}
      id="guide-step-title"
      component="h2"
      tabIndex={-1}
      sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: { xs: '1.375rem', md: '1.625rem' }, lineHeight: 1.2, letterSpacing: '-0.02em', color: color.ink, outline: 'none', '&:focus-visible': { outline: `2px solid ${color.focus}`, outlineOffset: 4 } }}
    >
      {title}
    </Typography>
  );

  return (
    <Box
      component="form"
      method="get"
      action="/pricing#guide"
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="guide-step-title"
      data-testid="pack-finder"
      data-step={step}
      sx={{
        bgcolor: color.paper2,
        border: `1px solid ${color.rule}`,
        borderRadius: `${radius.lg}px`,
        p: { xs: 2, sm: 3, md: 4 },
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr)',
        gap: 3,
      }}
    >
      {/* Progress and the answers so far. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Box component="ol" aria-label="Progress" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {questions.map((s, i) => {
            const done = step === 'result' || i < index;
            const current = s === step;
            return (
              <Box
                component="li"
                key={s}
                aria-current={current ? 'step' : undefined}
                sx={{
                  width: current ? 22 : 10,
                  height: 10,
                  borderRadius: `${radius.pill}px`,
                  bgcolor: done || current ? color.accent : 'transparent',
                  border: `1.5px solid ${done || current ? color.accent : color.muted}`,
                  opacity: done && !current ? 0.6 : 1,
                }}
              >
                <Box component="span" sx={srOnly}>
                  {`${stepShort[s]}${current ? ', current' : done ? ', done' : ''}`}
                </Box>
              </Box>
            );
          })}
        </Box>
        <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>
          {step === 'result' ? 'Done' : step === 'games' ? 'Question 1' : `Question ${index + 1} of ${questions.length}`}
        </Typography>
      </Box>

      {answered.length > 0 && (
        <Box component="ul" aria-label="Your answers" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {answered.map((s) => (
            <Box component="li" key={s} sx={{ minWidth: 0 }}>
              <Box
                component="button"
                type="submit"
                name="at"
                value={s}
                formNoValidate
                aria-label={`${stepShort[s]}: ${answerText(s, answers)}. Change`}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  maxWidth: '100%',
                  minHeight: 36,
                  px: 1.5,
                  py: 0.5,
                  font: 'inherit',
                  fontSize: '0.875rem',
                  color: color.ink2,
                  bgcolor: 'transparent',
                  border: `1px solid ${color.rule}`,
                  borderRadius: `${radius.pill}px`,
                  cursor: 'pointer',
                  transition: `border-color ${duration.fast}ms ${ease.out}`,
                  '&:hover': { borderColor: color.muted, color: color.ink },
                  '&:active': { bgcolor: color.paper3 },
                  '&:focus-visible': { outline: `2px solid ${color.focus}`, outlineOffset: 2 },
                }}
              >
                <Box component="span" sx={{ color: color.muted, whiteSpace: 'nowrap' }}>
                  {stepShort[s]}
                </Box>
                <Box component="span" sx={{ color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {answerText(s, answers)}
                </Box>
                <Box component="span" aria-hidden sx={{ color: color.accent, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Change
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* The earlier answers ride along, so a plain form submit keeps them. */}
      {answerFields(answers, step).map(([name, value], i) => (
        <input key={`${name}-${value}-${i}`} type="hidden" name={name} value={value} />
      ))}

      {step === 'result' ? (
        <Box component="section" aria-labelledby="guide-step-title" sx={{ display: 'grid', gap: 2 }}>
          {heading}
          {body}
        </Box>
      ) : (
        <Box component="fieldset" aria-describedby={view.held ? 'guide-held' : undefined} sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: 'grid', gap: 2 }}>
          <Box component="legend" sx={{ p: 0, mb: 2, float: 'left', width: '100%' }}>
            {heading}
          </Box>
          <Box sx={{ clear: 'both' }}>{body}</Box>
        </Box>
      )}

      {view.held && step !== 'result' && (
        <Typography id="guide-held" role="alert" sx={{ color: color.ban, fontSize: '0.9375rem', mt: -1 }}>
          {step === 'money' && draft.money === 'unsure' ? 'Read the note above, then pick Yes or No.' : heldHint[step]}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, borderTop: `1px solid ${color.rule}`, pt: 2.5 }}>
        {prev ? (
          <Button type="submit" name="at" value={prev} formNoValidate variant="text" sx={{ ...oneLine, color: color.ink2 }}>
            ← Back
          </Button>
        ) : step === 'result' ? null : (
          <span />
        )}
        {step === 'result' ? (
          <Button
            variant="text"
            href="/pricing#guide"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              go({ answers: { games: [] }, at: 'games' });
            }}
            sx={{ ...oneLine, color: color.ink2 }}
          >
            Start over
          </Button>
        ) : (
          <Button type="submit" name="at" value={nextStep(step)} variant="contained" data-testid="guide-next" sx={oneLine}>
            {nextStep(step) === 'result' || steps.indexOf(step) === steps.length - 2 ? 'See my answer' : 'Next'}
          </Button>
        )}
      </Box>

      <Box aria-live="polite" role="status" sx={srOnly}>
        {liveText}
      </Box>
    </Box>
  );
}
