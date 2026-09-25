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
import { earnMoneyRule, freeOrganizations, freeUseHelp, pricingTable, seatRule, vatNote } from '@/components/pricing';
import { PriceCalculator } from '@/components/PriceCalculator';
import { FreeLanConfirmation } from '@/components/FreeLanConfirmation';

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

const examples: { scenario: string; verdict: string; why: string }[] = [
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
    scenario: 'A freelancer uses CS2 Server Manager to install and run MatchZy Enhanced on 8 servers (6 + 2 spares) at a LAN run for profit.',
    verdict: '8 × €3 = €24',
    why: 'Every server set up is a seat, spares included, at €3 per seat for one event. CS2 Server Manager needs a license for commercial use, even though MatchZy Enhanced itself is MIT. Either the freelancer or the LAN can buy it: a license covers the named licensee and its contractors, for the named event.',
  },
  {
    scenario: 'A freelancer is paid to run 8 CS2 servers with CS2 Server Manager at a volunteer LAN where nobody else earns money.',
    verdict: '8 × €3 = €24',
    why: 'The freelancer earns money from it, so the freelancer pays full price, even though the event itself is free.',
  },
  {
    scenario: 'A LAN run for profit uses the full platform on 32 servers plus 2 spares, one 4-day event.',
    verdict: '34 × €5 = €170',
    why: 'The organizer earns money from it, so it is commercial use, and the full platform is €5 per seat for one event.',
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
      { name: 'Game packs', href: 'https://github.com/Auto-Tournament/packs', note: 'covered by a Platform license; packs published before 24 September 2026 stay MIT' },
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
    q: 'I only use CS2 Server Manager with MatchZy Enhanced. Do I need a license?',
    a: 'For commercial use, yes: €3 per seat. CS2 Server Manager needs a license for commercial use; MatchZy Enhanced itself is MIT. Running MatchZy Enhanced on its own, without CS2 Server Manager, is free. Personal use is free either way.',
  },
  {
    q: 'Do spare servers count?',
    a: 'Yes. A license with N seats allows no more than N game servers set up at any one time during the period, spares included, even a spare that never gets used.',
  },
  {
    q: 'Do game packs need their own license?',
    a: 'No. A Platform license covers the game packs used with it. There is no separate price for packs.',
  },
  {
    q: 'Who does the license cover?',
    a: 'The named licensee and its contractors, for the named event (or, for yearly licenses, the licensee’s own events). A freelancer working on someone else’s event is covered by that organizer’s license, or needs one that names the event.',
  },
  {
    q: 'I’m paid to run servers at a volunteer event. Do I need a license?',
    a: 'Yes, at the full price. You earn money from it, so your use is commercial, even when the event itself is free.',
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
    q: 'When is an event free?',
    a: `${freeUseHelp} ${freeOrganizations} ${earnMoneyRule}`,
  },
  {
    q: 'Using Auto Tournament commercially without a license?',
    a: "If we notify you in writing that your use is commercial and unlicensed, PolyForm gives you 32 days (first notice only) to come into compliance: stop the commercial use or buy a license, and put right past use. To settle past use, we offer a back-dated license at the normal price plus 50%. If you don't come into compliance within 32 days, all your PolyForm licenses end and we may claim compensation under the Norwegian Copyright Act (åndsverkloven § 81).",
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
              Auto Tournament is free when nobody earns money from it: personal and hobby use, events where all the money goes back into the event, and charities,
              schools and public bodies. If you earn money from it, you pay per game server seat. Prices below are in EUR. {vatNote}.
            </Typography>
            <Typography sx={{ mt: 2, maxWidth: '52ch', color: color.muted, fontSize: '0.9375rem' }}>
              Pricing v1, valid from 25 September 2026. If a price doesn&apos;t fit your case, email us and we&apos;ll work it out.
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
          id="pricing-table"
          title="What you pay"
          lede={`A seat is one game server. A license with N seats allows no more than N game servers set up at any one time during the period, spares included. Prices are in EUR. ${vatNote}.`}
        >
          <Box sx={{ overflowX: 'auto', border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px` }}>
            <Box
              component="table"
              sx={{
                width: '100%',
                minWidth: '40rem',
                borderCollapse: 'collapse',
                bgcolor: color.paper2,
                '& caption': { captionSide: 'top', textAlign: 'left', p: 2, color: color.ink2, fontSize: '0.875rem' },
                '& th, & td': { textAlign: 'left', p: 2, borderBottom: `1px solid ${color.rule}`, fontSize: '0.9375rem' },
                '& thead th': { color: color.muted, fontWeight: 600, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.02em' },
                '& tbody tr:last-of-type th, & tbody tr:last-of-type td': { borderBottom: 'none' },
                '& tbody th': { color: color.ink, fontWeight: 500 },
              }}
            >
              <caption>What you pay, by how you use Auto Tournament and who you are.</caption>
              <thead>
                <tr>
                  <th scope="col">You use</th>
                  <th scope="col">Non-commercial (nobody earns money) or non-profit organization</th>
                  <th scope="col">Commercial, per event (up to 5 days)</th>
                  <th scope="col">Commercial, yearly (unlimited events)</th>
                </tr>
              </thead>
              <tbody>
                {pricingTable.map((row) => (
                  <tr key={row.use}>
                    <th scope="row">{row.use}</th>
                    <td>{row.personal}</td>
                    <td>{row.event}</td>
                    <td>{row.yearly}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>

          <Box component="ul" sx={{ m: 0, mt: 3, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2, fontSize: '0.9375rem' }}>
            {[
              `${seatRule} N is your number of seats.`,
              'A Platform license covers the game packs used with it. There is no separate price for packs.',
              'Using CS2 Server Manager and Ready Up together on the same seat counts once: €3, not €6.',
              'What counts is what you run: CS2 Server Manager and Ready Up each need a license for commercial use; MatchZy Enhanced never does. CS2 Server Manager with MatchZy Enhanced, Ready Up on its own, or CS2 Server Manager installing Ready Up are all €3 per seat, counted once.',
              `${freeUseHelp} ${freeOrganizations}`,
              earnMoneyRule,
            ].map((item) => (
              <Box key={item} component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, '&::before': { content: '""', width: 6, height: 6, mt: '0.55em', borderRadius: '50%', bgcolor: color.accent, flex: 'none' } }}>
                {item}
              </Box>
            ))}
          </Box>

          <Box sx={{ mt: 3 }}>
            <FreeLanConfirmation />
          </Box>

          <Typography sx={{ mt: 3, color: color.ink2, fontSize: '0.9375rem' }}>
            32 servers + 2 spares at one four-day event = 34 seats → €102 with CS2 Server Manager and/or Ready Up, or €170 with the platform.
          </Typography>

          <Box sx={{ mt: { xs: 4, md: 5 } }}>
            <PriceCalculator />
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
          <Typography sx={{ mt: 3, color: color.muted, fontSize: '0.875rem' }}>Forks can&apos;t be relicensed.</Typography>
        </Section>

        <Section
          id="commercial-use"
          title="What counts as commercial use"
          lede="If you earn money from it, you pay full price. Any of the following with the platform, CS2 Server Manager, Ready Up or a game pack needs a license. A Platform license covers the game packs used with it."
        >
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 }}>
            {[
              'Paid hosting.',
              'Selling or reselling Auto Tournament.',
              'Events where the organizer makes a profit.',
              'Use inside a business.',
              'Being paid to set up or operate servers or tournaments for someone else, even for a flat fee, and even when that event is free.',
            ].map((item) => (
              <Box key={item} component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, '&::before': { content: '""', width: 6, height: 6, mt: '0.55em', borderRadius: '50%', bgcolor: color.accent, flex: 'none' } }}>
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
              'Number of seats (servers, spares included) and which tools you’ll run',
            ].map((item) => (
              <Box key={item} component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, '&::before': { content: '""', width: 6, height: 6, mt: '0.55em', borderRadius: '50%', bgcolor: color.accent, flex: 'none' } }}>
                {item}
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 3, color: color.ink2 }}>
            We check the details before issuing the license. If something doesn&apos;t match, we&apos;ll ask, and we refund in full if we can&apos;t verify you.
          </Typography>
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
            Buy it before the event. Not sure which option fits? Email and ask, no charge for asking.
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
