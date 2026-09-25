import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { Reveal } from '@/components/ui';
import { Footer, Nav } from '@/components/sections';
import { links } from '@/components/links';

const { color, radius } = tokens;

const title = 'Licensing & pricing';
const description =
  'Auto Tournament is free for non-commercial use under PolyForm Noncommercial 1.0.0. Commercial use is priced per server seat — see what a seat costs and how to buy a license.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/pricing' },
  openGraph: { title, description, url: 'https://autotournament.gg/pricing' },
  twitter: { title, description },
};

const email = 'sivert@autotournament.gg';
const mailHref = `mailto:${email}`;

function Section({ id, title: heading, lede, children }: { id?: string; title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Container maxWidth="lg" component="section" id={id} sx={{ py: { xs: 6, md: 10 } }}>
      <Reveal>
        <Box sx={{ maxWidth: '48rem', mb: { xs: 4, md: 6 } }}>
          <Typography variant="h2">{heading}</Typography>
          {lede && (
            <Typography sx={{ mt: 2, color: color.ink2 }}>{lede}</Typography>
          )}
        </Box>
        {children}
      </Reveal>
    </Container>
  );
}

type Tier = { name: string; price: string; period?: string; note: string; bullets: string[]; highlight?: boolean };

const tiers: Tier[] = [
  {
    name: 'Free',
    price: '€0',
    note: 'Non-commercial use, and the CS2 plugin for anyone',
    bullets: ['Friends, clubs, schools and communities', 'Free-entry events', 'MatchZy Enhanced (MIT) only, any use'],
  },
  {
    name: 'Event · Servers',
    price: '€3',
    period: '/ seat',
    note: 'One event, up to 5 consecutive days · CS2 Server Manager and/or Ready Up',
    bullets: ['Every server you set up is a seat, spares included'],
  },
  {
    name: 'Event · Platform + servers',
    price: '€5',
    period: '/ seat',
    note: 'One event, up to 5 consecutive days · the full Auto Tournament setup',
    bullets: ['Every server you set up is a seat, spares included'],
    highlight: true,
  },
  {
    name: 'Yearly · Servers',
    price: '€12',
    period: '/ seat / yr',
    note: 'Unlimited events for that many seats · CS2 Server Manager and/or Ready Up',
    bullets: ['4× the per-event seat price'],
  },
  {
    name: 'Yearly · Platform + servers',
    price: '€20',
    period: '/ seat / yr',
    note: 'Unlimited events for that many seats · the full Auto Tournament setup',
    bullets: ['4× the per-event seat price'],
  },
  {
    name: 'Hosting / resale',
    price: 'Custom quote',
    note: 'Selling Auto Tournament as a service',
    bullets: ['Managed hosting for other people or organizations', 'Contact us for a quote'],
  },
];

const examples: { scenario: string; verdict: string; why: string }[] = [
  {
    scenario: 'A school LAN with free entry.',
    verdict: 'Free',
    why: 'Non-commercial use: nobody pays to take part.',
  },
  {
    scenario: 'A freelancer is paid a flat fee to run 8 CS2 servers at one LAN, using only the MIT-licensed MatchZy Enhanced plugin.',
    verdict: 'No license needed',
    why: 'MatchZy Enhanced is MIT and free for any use, including paid work.',
  },
  {
    scenario: 'The same freelancer instead uses CS2 Server Manager or Ready Up on those servers: 6 in play plus 2 spares.',
    verdict: '8 × €3 = €24',
    why: 'Every server set up is a seat, spares included, at €3 per seat for one event.',
  },
  {
    scenario: 'A paid-entry LAN runs the full platform on 32 servers plus 2 spares, one 4-day event.',
    verdict: '34 × €5 = €170',
    why: 'Paid entry is commercial use, and the full platform is €5 per seat for one event.',
  },
  {
    scenario: 'An esports org runs events all year on 10 servers with the platform.',
    verdict: '10 × €20 = €200 / yr',
    why: 'Running events all year round fits the yearly seat price rather than paying per event.',
  },
  {
    scenario: 'A company sells hosted tournaments to customers.',
    verdict: 'Hosting / resale, custom quote',
    why: "That's reselling Auto Tournament as a service.",
  },
];

const licenseGroups: {
  license: string;
  mit: boolean;
  summary: string;
  items: { name: string; href?: string; note?: string }[];
}[] = [
  {
    license: 'PolyForm Noncommercial 1.0.0',
    mit: false,
    summary: 'Free for non-commercial use. Commercial use needs a license.',
    items: [
      { name: 'Auto Tournament platform', href: 'https://github.com/Auto-Tournament/auto-tournament', note: '3.0 and later' },
      { name: 'CS2 Server Manager', href: 'https://github.com/Auto-Tournament/cs2-server-manager' },
      { name: 'Ready Up', href: 'https://github.com/Auto-Tournament/ready-up', note: 'the new native CS2 plugin' },
      { name: 'Game packs', href: 'https://github.com/Auto-Tournament/packs', note: 'packs published before 24 September 2026 stay MIT' },
    ],
  },
  {
    license: 'MIT',
    mit: true,
    summary: 'Free for any use, including paid work. No license needed.',
    items: [
      { name: 'MatchZy Enhanced', href: 'https://github.com/Auto-Tournament/cs2-plugin', note: 'CS2 plugin, now named Auto Tournament CS2' },
      { name: 'Auto Tournament platform 2.4.15 and older', note: 'released as MatchZy Auto Tournament' },
    ],
  },
];

const faq: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Do I need a license if I only run MatchZy Enhanced?',
    a: 'No. MatchZy Enhanced (now named Auto Tournament CS2) is MIT licensed and free for any use, including paid work. Ready Up is a different plugin: it is under PolyForm Noncommercial, so commercial use of Ready Up needs a license.',
  },
  {
    q: 'Do spare servers count?',
    a: 'Yes. Every game server you set up for the event is a seat, even a spare that never gets used.',
  },
  {
    q: 'Do players or teams need a license?',
    a: 'No. Only whoever sets up the game servers or the platform needs one, priced per seat, if their use counts as commercial.',
  },
  {
    q: "I'm on 2.4.x",
    a: 'The Auto Tournament platform up to 2.4.15 (released as MatchZy Auto Tournament) is MIT licensed and stays that way. Free for any use.',
  },
  {
    q: 'What if I use it without a license?',
    a: (
      <>
        Contact us and we&apos;ll sort it out. The license terms apply either way.
      </>
    ),
  },
];

export default function Pricing() {
  return (
    <>
      <Nav />
      <main>
        <Box component="section">
          <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 4, md: 6 } }}>
            <Typography variant="h1" sx={{ fontSize: 'clamp(2.5rem, 3.6vw + 1rem, 4.5rem)', maxWidth: '20ch' }}>
              Free to play with.{' '}
              <Box component="span" sx={{ display: 'block', color: color.accent, textDecoration: 'underline', textDecorationThickness: '0.08em', textUnderlineOffset: '0.12em' }}>
                Licensed to run for money.
              </Box>
            </Typography>
            <Typography sx={{ mt: 3, maxWidth: '52ch', color: color.ink2, fontSize: '1.125rem' }}>
              Auto Tournament is free for non-commercial use: friends, clubs, schools, communities and free-entry events. Running it for money is priced per game
              server seat. Prices below are in EUR, excluding VAT.
            </Typography>
            <Typography sx={{ mt: 2, maxWidth: '52ch', color: color.muted, fontSize: '0.9375rem' }}>
              This is a first version. If a price doesn&apos;t fit your case, email us and we&apos;ll work it out.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 4 }}>
              <Button variant="contained" href={mailHref}>
                Email {email}
              </Button>
              <Button variant="outlined" href={links.licensing} target="_blank" rel="noopener noreferrer">
                Read the license reference
              </Button>
            </Box>
          </Container>
        </Box>

        <Section
          id="licenses"
          title="What's licensed how"
          lede="Each project has one license. Only the projects under PolyForm Noncommercial need a license for commercial use."
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: '1fr 1fr' }, gap: 3 }}>
            {licenseGroups.map((group) => (
              <Box key={group.license} sx={{ bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, p: 3 }}>
                <Chip size="small" color={group.mit ? 'primary' : 'default'} label={group.license} sx={{ mb: 1.5 }} />
                <Typography sx={{ color: color.ink, fontWeight: 600, mb: 1.5 }}>{group.summary}</Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, color: color.ink2, display: 'grid', gap: 1 }}>
                  {group.items.map((item) => (
                    <li key={item.name}>
                      {item.href ? (
                        <Box component="a" href={item.href} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
                          {item.name}
                        </Box>
                      ) : (
                        item.name
                      )}
                      {item.note ? <Box component="span" sx={{ color: color.muted }}>{` (${item.note})`}</Box> : null}
                    </li>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 3, color: color.muted, fontSize: '0.875rem' }}>Forks can&apos;t be relicensed.</Typography>
        </Section>

        <Section
          id="commercial-use"
          title="What counts as commercial use"
          lede="Any of the following on the platform, CS2 Server Manager, Ready Up or a game pack needs a license:"
        >
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 }}>
            {[
              'Paid hosting.',
              'Selling or reselling Auto Tournament.',
              'Paid-entry events (non-profit and community events that only cover costs get 50% off).',
              'Use inside a business.',
              'Being paid to set up or operate servers or tournaments for someone else, even for a flat fee.',
            ].map((item) => (
              <Box key={item} component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, '&::before': { content: '""', width: 6, height: 6, mt: '0.55em', borderRadius: '50%', bgcolor: color.accent, flex: 'none' } }}>
                {item}
              </Box>
            ))}
          </Box>
        </Section>

        <Section
          id="tiers"
          title="Tiers"
          lede={
            <>
              A seat is one game server you set up for the event, spares included, even if it&apos;s never used. Prices are in EUR, excluding VAT. Yearly is 4× the
              per-event seat price, for unlimited events on that many seats.
            </>
          }
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))', gap: 2 }}>
            {tiers.map((tier) => (
              <Box
                component="article"
                key={tier.name}
                sx={{
                  bgcolor: color.paper2,
                  border: `1px solid ${tier.highlight ? color.accent : color.rule}`,
                  borderRadius: `${radius.lg}px`,
                  p: 3,
                  display: 'grid',
                  gap: 1.5,
                  alignContent: 'start',
                }}
              >
                <Typography variant="h3">{tier.name}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                  <Typography sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.75rem' }}>{tier.price}</Typography>
                  {tier.period && (
                    <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>{tier.period}</Typography>
                  )}
                </Box>
                <Typography sx={{ color: color.ink2, fontSize: '0.875rem' }}>{tier.note}</Typography>
                <Box component="ul" sx={{ m: 0, mt: 1, p: 0, listStyle: 'none', display: 'grid', gap: 0.75, color: color.muted, fontSize: '0.8125rem' }}>
                  {tier.bullets.map((b) => (
                    <Box key={b} component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, '&::before': { content: '""', width: 5, height: 5, mt: '0.5em', borderRadius: '50%', bgcolor: color.rule, flex: 'none' } }}>
                      {b}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 3, color: color.ink2, fontSize: '0.9375rem' }}>
            Work out your price: seats × price per seat. Example: 34 seats (32 + 2 spares) for one event = €102 servers only, or €170 with the platform.
          </Typography>
          <Typography sx={{ mt: 1, color: color.muted, fontSize: '0.875rem' }}>
            Non-profit or community events where entry only covers costs get 50% off any price above.
          </Typography>
        </Section>

        <Section id="examples" title="Examples">
          <Box sx={{ display: 'grid', gap: 2 }}>
            {examples.map((ex) => (
              <Box
                component="article"
                key={ex.scenario}
                sx={{
                  bgcolor: color.paper2,
                  border: `1px solid ${color.rule}`,
                  borderRadius: `${radius.lg}px`,
                  p: 3,
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'minmax(0,1fr) auto' },
                  gap: { xs: 1.5, sm: 3 },
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography sx={{ color: color.ink }}>{ex.scenario}</Typography>
                  <Typography sx={{ mt: 0.75, color: color.muted, fontSize: '0.8125rem' }}>{ex.why}</Typography>
                </Box>
                <Chip size="small" color={ex.verdict === 'Free' || ex.verdict === 'No license needed' ? 'default' : 'primary'} label={ex.verdict} sx={{ justifySelf: { xs: 'start', sm: 'end' } }} />
              </Box>
            ))}
          </Box>
        </Section>

        <Section
          id="get-a-license"
          title="Getting a license"
          lede={
            <>
              Email{' '}
              <Box component="a" href={mailHref} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
                {email}
              </Box>{' '}
              with:
            </>
          }
        >
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 }}>
            {[
              'Who you are: name or company, country, and VAT ID if you have one.',
              'Event date(s), or a start date for a yearly license.',
              'The number of seats, and which option: servers only, or platform + servers.',
            ].map((item) => (
              <Box key={item} component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, '&::before': { content: '""', width: 6, height: 6, mt: '0.55em', borderRadius: '50%', bgcolor: color.accent, flex: 'none' } }}>
                {item}
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 3, color: color.ink2 }}>
            You get an invoice, and the license is valid once paid. The written license confirmation names the licensee, option, seats and period. Buy it before
            the event.
          </Typography>
          <Typography sx={{ mt: 2, color: color.ink2 }}>
            Not sure which option fits? Email and ask, no charge for asking.
          </Typography>
          <Button variant="contained" href={mailHref} sx={{ mt: 3 }}>
            Email {email}
          </Button>
        </Section>

        <Section id="faq" title="FAQ">
          <Box sx={{ display: 'grid', gap: 3 }}>
            {faq.map((item) => (
              <Box key={item.q}>
                <Typography variant="subtitle1">{item.q}</Typography>
                <Typography sx={{ mt: 0.75, color: color.ink2 }}>{item.a}</Typography>
              </Box>
            ))}
          </Box>
        </Section>
      </main>
      <Footer />
    </>
  );
}
