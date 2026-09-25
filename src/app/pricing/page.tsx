import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Reveal } from '@/components/ui';
import { Footer, Nav } from '@/components/sections';
import { links } from '@/components/links';
import {
  earnMoneyRule,
  formatEuro,
  founderBadge,
  founderTerms,
  founderUpdateWarning,
  freeOrganizations,
  freeUseHelp,
  maxPackServers,
  packIn,
  packRules,
  pricingVersion,
  serverLimitRule,
  vatNote,
  type Pack,
  type PackId,
  type Period,
} from '@/components/pricing';
import { getPacks } from '@/lib/stripePrices';
import { PackPricing } from '@/components/PackPricing';
import { PriceCalculator } from '@/components/PriceCalculator';
import { FreeLanConfirmation } from '@/components/FreeLanConfirmation';

const { color, radius } = tokens;

// Prices come from Stripe at request time (cached in memory for 5 minutes in
// stripePrices.ts). The Stripe key is only there at runtime, so a page built
// at build time would always show the fallback prices.
export const dynamic = 'force-dynamic';

const title = 'Licensing & pricing';
const description =
  'Auto Tournament is free for non-commercial use under PolyForm Noncommercial 1.0.0. Commercial use is a fixed pack sized by how many game servers you run, per event, yearly or as a founding supporter.';

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

function examplesFor(packs: readonly Pack[]): { scenario: string; verdict: string; why: string }[] {
  const price = (id: PackId, period: Period) => formatEuro(packIn(packs, id).prices[period]);
  const upTo = (id: PackId) => packIn(packs, id).maxServers;
  const max = maxPackServers(packs);
  return [
    {
      scenario: 'A volunteer-run LAN charges entry. All entry fees and sponsor money go back into the event, and nobody is paid or takes profit.',
      verdict: 'Free',
      why: 'Nobody earns money from it, so it is non-commercial.',
    },
    {
      scenario: 'A school LAN with free entry.',
      verdict: 'Free',
      why: 'Schools are on the license’s list of organizations that use it free, even when they charge entry.',
    },
    {
      scenario: 'A freelancer is paid a flat fee to run 8 CS2 servers at one LAN, using only the MIT-licensed MatchZy Enhanced plugin.',
      verdict: 'No license needed',
      why: 'MatchZy Enhanced is MIT and free for any use, including paid work.',
    },
    {
      scenario: 'A small LAN party run for profit uses the platform on 4 servers for one weekend.',
      verdict: `Platform S, ${price('platform-s', 'event')}`,
      why: `The organizer earns money from it, so it is commercial use. 4 servers fit the S pack (up to ${upTo('platform-s')}), for one event.`,
    },
    {
      scenario: 'A freelancer uses CS2 Server Manager to install and run MatchZy Enhanced on 8 servers (6 + 2 spares) at a volunteer LAN where nobody else earns money.',
      verdict: `Servers M, ${price('servers-m', 'event')}`,
      why: `The freelancer earns money from it, so the freelancer pays, even though the event itself is free. Spares count, so 8 servers need the M pack (up to ${upTo('servers-m')}). CS2 Server Manager needs a license for commercial use, even though MatchZy Enhanced itself is MIT.`,
    },
    {
      scenario: 'A freelancer runs 34 servers (32 + 2 spares) with CS2 Server Manager for a paying client.',
      verdict: `Servers L, ${price('servers-l', 'event')}`,
      why: `34 servers fit the L pack (up to ${upTo('servers-l')}): ${price('servers-l', 'event')} for one event. As a founding supporter it is ${price('servers-l', 'founder')} once, for every version released in the next 12 months.`,
    },
    {
      scenario: 'An esports org runs events all year on 10 servers with the platform.',
      verdict: `Platform M, ${price('platform-m', 'year')} / yr`,
      why: `Running events all year round fits the yearly Platform M pack (up to ${upTo('platform-m')} servers) rather than paying per event.`,
    },
    {
      scenario: `A company sells hosted tournaments to customers, or runs more than ${max} servers.`,
      verdict: 'Contact us, custom quote',
      why: `Hosting or reselling Auto Tournament as a service, and anything above ${max} servers, is priced with you.`,
    },
  ];
}

const bullet = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 1.5,
  '&::before': { content: '""', width: 6, height: 6, mt: '0.55em', borderRadius: '50%', bgcolor: color.accent, flex: 'none' },
} as const;

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
      { name: 'Game packs', href: 'https://github.com/Auto-Tournament/packs', note: 'covered by a Platform pack; packs published before 24 September 2026 stay MIT' },
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

function faqFor(packs: readonly Pack[]): { q: string; a: React.ReactNode }[] {
  const max = maxPackServers(packs);
  const serversS = packIn(packs, 'servers-s');
  return [
    {
      q: 'Do I need a license if I only run MatchZy Enhanced?',
      a: 'No. MatchZy Enhanced (now named Auto Tournament CS2) is MIT licensed and free for any use, including paid work. Ready Up is a different plugin: it is under PolyForm Noncommercial, so commercial use of Ready Up needs a license.',
    },
    {
      q: 'I only use CS2 Server Manager with MatchZy Enhanced. Do I need a license?',
      a: `For commercial use, yes: a Servers pack, from ${formatEuro(serversS.prices.event)} per event for up to ${serversS.maxServers} servers. CS2 Server Manager needs a license for commercial use; MatchZy Enhanced itself is MIT. Running MatchZy Enhanced on its own, without CS2 Server Manager, is free. Personal use is free either way.`,
    },
    {
      q: 'Do spare servers count?',
      a: `Yes. ${serverLimitRule} A spare that never gets used still counts.`,
    },
    {
      q: 'Can I buy two small packs instead of a bigger one?',
      a: 'No. It is one pack per event, or per 12 months for yearly. Packs can’t be combined or stacked, and Servers and Platform can’t be combined: Platform already includes the servers.',
    },
    {
      q: 'We need more servers than we planned. What now?',
      a: `Email us before you set them up. You upgrade to the next size and pay the difference, and we send an updated license confirmation. Above ${max} servers, we work out a custom quote with you.`,
    },
    {
      q: 'What happens after the first 12 months of a founding supporter pack?',
      a: `You keep commercial use of every version released in those 12 months, for good. Renewing updates is optional, at the yearly price of the same pack, and brings you back to the latest version. ${founderUpdateWarning}.`,
    },
    {
      q: 'Do game packs need their own license?',
      a: 'No. A Platform pack covers the game packs used with it. There is no separate price for game packs.',
    },
    {
      q: 'Who does the license cover?',
      a: 'The named licensee and its contractors, for the named event (or, for yearly and founding supporter licenses, the licensee’s own events). A freelancer working on someone else’s event is covered by that organizer’s license, or needs one that names the event.',
    },
    {
      q: 'I’m paid to run servers at a volunteer event. Do I need a license?',
      a: 'Yes, at the full price. You earn money from it, so your use is commercial, even when the event itself is free.',
    },
    {
      q: 'Do players or teams need a license?',
      a: 'No. Only whoever sets up the game servers or the platform needs one, if their use counts as commercial.',
    },
    {
      q: 'I bought a per-seat license under Pricing v1.',
      a: 'It keeps the terms you bought it on. Nothing changes for that license.',
    },
    {
      q: "I'm on 2.4.x",
      a: 'The Auto Tournament platform up to 2.4.15 (released as MatchZy Auto Tournament) is MIT licensed and stays that way. Free for any use.',
    },
    {
      q: 'When is an event free?',
      a: `${freeUseHelp} ${freeOrganizations} ${earnMoneyRule}`,
    },
    {
      q: 'Using Auto Tournament commercially without a license?',
      a: "If we notify you in writing that your use is commercial and unlicensed, PolyForm gives you 32 days (first notice only) to come into compliance: stop the commercial use or buy a license, and put right past use. To settle past use, we offer a back-dated license at the normal price plus 50%. If you don't come into compliance within 32 days, all your PolyForm licenses end and we may claim compensation under the Norwegian Copyright Act (åndsverkloven § 81).",
    },
  ];
}

export default async function Pricing() {
  // Plain numbers only go to the client components; the Stripe price ids stay here.
  const priceSource = await getPacks();
  const { packs } = priceSource;
  const pricesAvailable = priceSource.source === 'stripe';
  const examples = examplesFor(packs);
  const faq = faqFor(packs);
  return (
    <>
      <Nav />
      <main>
        <Box component="section">
          <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 14 }, pb: { xs: 4, md: 6 } }}>
            <Typography variant="h1" sx={{ fontSize: 'clamp(2.25rem, 3vw + 1rem, 4rem)', maxWidth: '22ch' }}>
              Free if nobody earns money from it.{' '}
              <Box component="span" sx={{ color: color.accent }}>
                If you do, pick a pack.
              </Box>
            </Typography>
            <Typography sx={{ mt: 3, maxWidth: '56ch', color: color.ink2, fontSize: '1.125rem' }}>
              One fixed price per event, per year, or once as a founding supporter. The pack size is the most game servers you set up at a time.
            </Typography>
            <Typography sx={{ mt: 2, maxWidth: '56ch', color: color.muted, fontSize: '0.9375rem' }}>
              {pricingVersion}. Prices in EUR. {vatNote}. If a price doesn&apos;t fit your case, email us and we&apos;ll work it out.
            </Typography>
          </Container>
        </Box>

        <Container maxWidth="lg" component="section" id="packs" aria-label="Packs" sx={{ pb: { xs: 6, md: 10 } }}>
          <PackPricing packs={packs} pricesAvailable={pricesAvailable} />
        </Container>

        <Section id="free" title="Free if…" lede="No license, no payment, no registration.">
          <Box component="ul" data-testid="free-list" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2, gridTemplateColumns: { xs: 'minmax(0,1fr)', md: '1fr 1fr' } }}>
            {[
              ['Zero-profit LANs', freeUseHelp],
              ['Non-profit organizations', freeOrganizations],
              ['Personal use', 'Hobby projects, learning and playing with friends, under PolyForm’s personal-use terms.'],
              ['MatchZy Enhanced, always', 'The MIT CS2 plugin is free for any use, including paid work. CS2 Server Manager and Ready Up need a license when someone earns money from them.'],
            ].map(([head, body]) => (
              <Box key={head} component="li" sx={{ bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, p: 2.5 }}>
                <Typography sx={{ color: color.ink, fontWeight: 600, mb: 0.5 }}>{head}</Typography>
                <Typography sx={{ fontSize: '0.9375rem' }}>{body}</Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 3, color: color.ink2 }}>
            <strong>Who pays:</strong> {earnMoneyRule}
          </Typography>
        </Section>

        <Section
          id="calculator-intro"
          title="Can't decide? Let us recommend a pack"
          lede="Tell us what you'll run and how many servers, and we'll suggest the right pack."
        >
          <PriceCalculator packs={packs} pricesAvailable={pricesAvailable} />
        </Section>

        <Section id="rules" title="The rules" lede="Short, so there are no surprises.">
          <Box component="ul" data-testid="pack-rules" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 }}>
            {[
              serverLimitRule,
              ...packRules(packs),
              'What counts is what you run: CS2 Server Manager and Ready Up each need a license for commercial use; MatchZy Enhanced never does. Either or both of them is a Servers pack.',
              'A Platform pack covers the game packs used with it. There is no separate price for game packs.',
            ].map((item) => (
              <Box key={item} component="li" sx={bullet}>
                {item}
              </Box>
            ))}
          </Box>

          <Box id="founder-terms" sx={{ mt: { xs: 4, md: 5 }, scrollMarginTop: 96 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25, mb: 2 }}>
              <Typography variant="h3" sx={{ fontSize: '1.25rem' }}>
                Founding supporter terms
              </Typography>
              <Chip size="small" variant="outlined" label={founderBadge} />
            </Box>
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 }}>
              {[...founderTerms(packs), `${founderUpdateWarning}.`].map((item) => (
                <Box key={item} component="li" sx={bullet}>
                  {item}
                </Box>
              ))}
            </Box>
          </Box>
        </Section>

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
          <Typography sx={{ mt: 3, color: color.muted, fontSize: '0.875rem' }}>
            Forks can&apos;t be relicensed. The full details are in the{' '}
            <Box component="a" href={links.licensing} target="_blank" rel="noopener noreferrer" sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
              license reference ↗
            </Box>
            .
          </Typography>
        </Section>

        <Section
          id="commercial-use"
          title="What counts as commercial use"
          lede="If you earn money from it, you pay full price. Any of the following with the platform, CS2 Server Manager, Ready Up or a game pack needs a license. A Platform pack covers the game packs used with it."
        >
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 }}>
            {[
              'Paid hosting.',
              'Selling or reselling Auto Tournament.',
              'Events where the organizer makes a profit.',
              'Use inside a business.',
              'Being paid to set up or operate servers or tournaments for someone else, even for a flat fee, and even when that event is free.',
            ].map((item) => (
              <Box key={item} component="li" sx={bullet}>
                {item}
              </Box>
            ))}
          </Box>
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
          id="what-we-need"
          title="What we need from you"
          lede="Licenses are sold to businesses and organizations, including clubs and associations, not to consumers. A license names who holds it, so we verify every buyer before sending the license confirmation."
        >
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 }}>
            {[
              'The legal name of the company or organization, and your name',
              'Organization number, and VAT ID if it has one',
              'Country and billing address',
              'Contact email and phone',
              'The event: name, date(s), venue or city, and website or social link. Paid operators: the event or client you work for',
              'The pack and period, which tools you’ll run, and how many servers you’ll set up (spares included)',
            ].map((item) => (
              <Box key={item} component="li" sx={bullet}>
                {item}
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 3, color: color.ink2 }}>
            We check the details before issuing the license. If something doesn&apos;t match, we&apos;ll ask, and we refund in full if we can&apos;t verify you.
          </Typography>
          <Box sx={{ mt: 3 }}>
            <FreeLanConfirmation />
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
              or use the calculator above, then:
            </>
          }
        >
          <Box component="ol" sx={{ m: 0, p: 0, pl: 2.5, color: color.ink2, display: 'grid', gap: 1.5 }}>
            <li>Pay by card with the calculator above, or ask for an invoice by email. Either way you get an invoice.</li>
            <li>
              By paying you accept the{' '}
              <Box component="a" href={links.terms} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
                Commercial License Terms
              </Box>{' '}
              and{' '}
              <Box component="a" href={links.termsOfSale} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
                Terms of Sale
              </Box>
              .
            </li>
            <li>We verify the details you sent us and confirm your license by email within 2 working days.</li>
          </Box>
          <Typography sx={{ mt: 3, color: color.ink2 }}>
            Buy it before the event. Not sure which pack fits? Email and ask, no charge for asking.
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
