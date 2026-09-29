/*
 * Hallmark · macrostructure: Guided flow (question steps → one answer → folded details: diagram, packs, alternatives, fine print)
 * genre: modern-minimal · theme: Auto Tournament system (src/theme/tokens.ts, Sora + Geist) · nav: N5 · footer: Ft5
 * pre-emit critique: P4 H5 E4 S5 R4 V4
 */
import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { Footer, Nav } from '@/components/sections';
import { links } from '@/components/links';
import {
  earnMoneyRule,
  formatEuro,
  founderBadge,
  founderSalesOpen,
  founderLifetime,
  founderShutdownPromise,
  founderTerms,
  founderUpdateWarning,
  freeOrganizations,
  freeUseHelp,
  maxPackServers,
  neverLockOut,
  packIn,
  packRules,
  pricingVersion,
  serverLimitRule,
  yearlyAfterExpiry,
  yearlyCs2Note,
  yearlyUpdates,
  type Pack,
  type PackId,
  type Period,
} from '@/components/pricing';
import { getPacks } from '@/lib/stripePrices';
import { PackPricing } from '@/components/PackPricing';
import { licenseStore } from '@/lib/license/store';
import { PackFinder } from '@/components/PackFinder';
import { parseAnswers } from '@/components/findPack';
import { Disclosure } from '@/components/Disclosure';
import { Alternatives, ProductStack } from '@/components/PricingGuide';
import { CheckoutProvider } from '@/components/checkout/Checkout';
import { headers } from 'next/headers';
import { countryFromHeader } from '@/lib/country';
import { stripePublishableKey } from '@/lib/stripePublishable';

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

const underline = { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule, textUnderlineOffset: '0.15em' } as const;
/** Short links inside prose: keep them on one line. */
const underlineNowrap = { ...underline, whiteSpace: 'nowrap' } as const;

/** A page section with an h2. `pad` varies the rhythm so every section doesn't sit on the same spacing. */
function Section({
  id,
  title: heading,
  lede,
  pad = 'normal',
  split = false,
  children,
}: {
  id: string;
  title: string;
  lede?: React.ReactNode;
  pad?: 'tight' | 'normal' | 'loose';
  /** Heading in a narrow column on the left (it stays in view on desktop), content on the right. */
  split?: boolean;
  children: React.ReactNode;
}) {
  const py = { tight: { xs: 5, md: 7 }, normal: { xs: 6, md: 10 }, loose: { xs: 8, md: 13 } }[pad];
  return (
    <Container
      maxWidth="lg"
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      sx={{
        py,
        ...(split && {
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) minmax(0,2.2fr)' },
          columnGap: { md: 8 },
          alignItems: 'start',
        }),
      }}
    >
      <Box sx={{ maxWidth: '46rem', mb: { xs: 4, md: split ? 0 : 5 }, ...(split && { position: { md: 'sticky' }, top: { md: 112 } }) }}>
        <Typography id={`${id}-title`} variant="h2">
          {heading}
        </Typography>
        {lede && <Typography sx={{ mt: 2, color: color.ink2 }}>{lede}</Typography>}
      </Box>
      {children}
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
      scenario: 'A freelancer uses CS2 Server Manager to install and run MatchZy Enhanced on 10 servers (8 + 2 spares) for a 16-team volunteer LAN where nobody else earns money.',
      verdict: `Servers M, ${price('servers-m', 'event')}`,
      why: `The freelancer earns money from it, so the freelancer pays, even though the event itself is free. Spares count, so 10 servers need the M pack (up to ${upTo('servers-m')}). CS2 Server Manager needs a license for commercial use, even though MatchZy Enhanced itself is MIT.`,
    },
    {
      scenario: 'A freelancer runs 34 servers (32 + 2 spares) with CS2 Server Manager for a paying client, once a year.',
      verdict: `Servers L, ${price('servers-l', 'event')}`,
      why: `34 servers fit the L pack (up to ${upTo('servers-l')}): ${price('servers-l', 'event')} for one event. Running several client events a year? The yearly pack (${price('servers-l', 'year')}) covers events you operate for clients too.`,
    },
    {
      scenario: 'An esports org runs 32-team events all year on 18 servers with the platform.',
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
      a: (
        <>
          <Box component="a" href={`${links.contact}?topic=quote`} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule }}>
            Contact us
          </Box>{' '}
          before you set them up. You upgrade to the next size and pay the difference, and we send an updated license confirmation. Above {max} servers, we
          work out a custom quote with you.
        </>
      ),
    },
    {
      q: 'What happens when a yearly pack ends?',
      a: `${yearlyUpdates} ${yearlyAfterExpiry} ${yearlyCs2Note}`,
    },
    {
      q: 'What does “lifetime updates” mean for a founding supporter pack?',
      a: `You pay once and get every new version, ${founderLifetime}: fixes, CS2 compatibility updates and new features, with no yearly fee. The pack size is fixed; moving to a bigger size costs the difference between the founder prices. ${founderUpdateWarning}.`,
    },
    {
      q: 'What if Auto Tournament stops being sold?',
      a: `Founding supporters are covered. ${founderShutdownPromise}`,
    },
    {
      q: 'Can a license lock me out?',
      a: `No. ${neverLockOut}`,
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
      a: 'Yes. You earn money from it, so you need a license, even when the event itself is free.',
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

const list = { m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, color: color.ink2 } as const;

export default async function Pricing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The guide's answers live in the query, so a reload or a shared link (or a browser without JavaScript) lands on the same step.
  const initial = parseAnswers(await searchParams);
  // Plain numbers only go to the client components; the Stripe price ids stay here.
  const priceSource = await getPacks();
  let founderOpen = true;
  try {
    founderOpen = founderSalesOpen(await licenseStore().founderCount());
  } catch {
    founderOpen = founderSalesOpen(0);
  }
  const { packs } = priceSource;
  const pricesAvailable = priceSource.source === 'stripe';
  // Read at request time (the image is built without .env): Embedded Checkout when set.
  const publishableKey = pricesAvailable ? stripePublishableKey() : null;
  const examples = examplesFor(packs);
  const faq = faqFor(packs);
  return (
    <>
      <Nav />
      <CheckoutProvider publishableKey={publishableKey} country={countryFromHeader((await headers()).get('cf-ipcountry'))}>
      <main>
        {/* 1 · The rule, then the guide: a few questions, one answer. */}
        <Box component="section" id="guide" aria-labelledby="pricing-title" sx={{ scrollMarginTop: 80 }}>
          {/* Old links (#calculator, #setups, #free) land on the guide. */}
          <Box component="span" id="calculator" aria-hidden sx={{ display: 'block', height: 0 }} />
          <Box component="span" id="setups" aria-hidden sx={{ display: 'block', height: 0 }} />
          <Box component="span" id="free" aria-hidden sx={{ display: 'block', height: 0 }} />
          <Container maxWidth="lg" sx={{ pt: { xs: 5, md: 10 }, pb: { xs: 5, md: 8 } }}>
            <Box sx={{ maxWidth: '52rem', mx: 'auto', display: 'grid', gap: { xs: 3, md: 4 } }}>
              <div>
                <Typography id="pricing-title" variant="h1" sx={{ fontSize: 'clamp(2rem, 2.4vw + 1rem, 3.25rem)', maxWidth: '22ch' }}>
                  Free if nobody earns money from your events.{' '}
                  <Box component="span" sx={{ color: color.accent }}>
                    If someone does, one fixed price.
                  </Box>
                </Typography>
                <Typography sx={{ mt: 2, maxWidth: '58ch', color: color.ink2, fontSize: { xs: '1rem', md: '1.125rem' } }}>
                  Free for non-profit events and for trying it out privately. The moment you earn money from it, you need a license. Answer a few questions
                  to see if you need one, and which.
                </Typography>
              </div>
              <PackFinder packs={packs} pricesAvailable={pricesAvailable} founderOpen={founderOpen} initial={initial} />
              <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>
                Rather compare everything yourself?{' '}
                <Box component="a" href="#packs" sx={underline}>
                  See all packs
                </Box>{' '}
                or{' '}
                <Box component="a" href={`${links.contact}?topic=quote`} target="_blank" rel="noopener" sx={underline}>
                  ask us
                </Box>
                .
              </Typography>
            </Box>
          </Container>
        </Box>

        {/* 2 · What each product is, as one diagram, folded. */}
        <Container maxWidth="lg" component="section" aria-labelledby="details-title" sx={{ pt: { xs: 5, md: 8 } }}>
          <Typography id="details-title" variant="h2" sx={{ mb: { xs: 2, md: 3 } }}>
            The details
          </Typography>
          <Disclosure id="whats-what" title="What you’d be buying: the four pieces, in one picture">
            <ProductStack />
          </Disclosure>
        </Container>

        {/* 3 · The packs, with direct Stripe checkout. */}
        <Section
          id="packs"
          title="All packs"
          lede="One fixed price, sized by the most game servers you set up at the same time, spares included."
          pad="normal"
        >
          {/* The guide and old links point here; PackPricing reads the hash and opens that product. */}
          <Box component="span" id="packs-servers" aria-hidden sx={{ display: 'block', height: 0 }} />
          <Box component="span" id="packs-platform" aria-hidden sx={{ display: 'block', height: 0 }} />
          <Box
            component="ul"
            data-testid="pack-notes"
            sx={{ ...list, gap: { xs: 1.5, md: 3 }, mb: { xs: 4, md: 5 }, gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(3, minmax(0,1fr))' }, fontSize: '0.9375rem' }}
          >
            <Box component="li" sx={{ borderLeft: { md: `1px solid ${color.rule}` }, pl: { md: 2 } }}>
              <Box component="strong" sx={{ color: color.ink }}>
                What counts:
              </Box>{' '}
              every game server running our software, today CS2 Server Manager and Ready Up, including spares, practice and test servers. Game servers without our software don&apos;t count.
            </Box>
            <Box component="li" sx={{ borderLeft: { md: `1px solid ${color.rule}` }, pl: { md: 2 } }}>
              <Box component="strong" sx={{ color: color.ink }}>
                Other games:
              </Box>{' '}
              a Platform pack covers the game packs you use with it. There is no separate price for game packs.
            </Box>
            <Box component="li" sx={{ borderLeft: { md: `1px solid ${color.rule}` }, pl: { md: 2 } }}>
              <Box component="strong" sx={{ color: color.ink }}>
                How long:
              </Box>{' '}
              one event is up to 5 days in a row. Yearly is 12 months with unlimited events, and never renews by itself.
            </Box>
          </Box>
          <PackPricing packs={packs} pricesAvailable={pricesAvailable} founderOpen={founderOpen} />
          <Typography sx={{ mt: 3, maxWidth: '62ch', color: color.muted, fontSize: '0.875rem' }}>
            {pricingVersion}. If a price doesn&apos;t fit your case,{' '}
            <Box component="a" href={`${links.contact}?topic=quote`} target="_blank" rel="noopener" sx={underline}>
              contact us
            </Box>{' '}
            and we&apos;ll work it out.
          </Typography>
        </Section>

        {/* 4 · How it compares, from checked sources only, folded. */}
        <Container maxWidth="lg" component="section" aria-label="Compare" sx={{ pb: { xs: 2, md: 4 } }}>
          <Disclosure id="compare" title="What the alternatives cost">
            <Typography sx={{ mb: 3, color: color.ink2, maxWidth: '62ch' }}>
              Public prices, checked on 28 September 2026, each with its source. Where an alternative does something we don’t, it says so.
            </Typography>
            <Alternatives packs={packs} />
          </Disclosure>
        </Container>

        {/* 8 · The fine print, folded. Same wording as before; /terms has the full text. */}
        <Section
          id="fine-print"
          title="Rules and licenses"
          lede={
            <>
              The short version. The{' '}
              <Box component="a" href={links.terms} sx={underlineNowrap}>
                Commercial License Terms
              </Box>{' '}
              have the full wording.
            </>
          }
          pad="tight"
          split
        >
          <div>
            <Disclosure id="rules" title="Pack rules">
              <Box component="ul" data-testid="pack-rules" sx={list}>
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
            </Disclosure>

            <Disclosure id="founder-terms" title="Founding supporter terms">
              <Chip size="small" variant="outlined" label={founderBadge} sx={{ mb: 2, maxWidth: '100%', height: 'auto', py: 0.25, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
              <Box component="ul" sx={list}>
                {[...founderTerms(packs), `${founderUpdateWarning}.`, neverLockOut].map((item) => (
                  <Box key={item} component="li" sx={bullet}>
                    {item}
                  </Box>
                ))}
              </Box>
            </Disclosure>

            <Disclosure id="commercial-use" title="What counts as commercial use">
              <Typography sx={{ mb: 2 }}>
                If you earn money from it, you need a license. Any of the following with the platform, CS2 Server Manager, Ready Up or a game pack needs a license. A
                Platform pack covers the game packs used with it.
              </Typography>
              <Box component="ul" sx={list}>
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
            </Disclosure>

            <Disclosure id="examples" title="Examples">
              <Box component="ul" sx={{ ...list, gap: 0 }}>
                {examples.map((ex) => (
                  <Box
                    component="li"
                    key={ex.scenario}
                    sx={{
                      py: 2,
                      borderBottom: `1px solid ${color.rule}`,
                      '&:first-of-type': { pt: 0 },
                      '&:last-of-type': { borderBottom: 0, pb: 0 },
                      display: 'grid',
                      gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'minmax(0,1fr) auto' },
                      gap: { xs: 1, sm: 3 },
                      alignItems: 'start',
                    }}
                  >
                    <div>
                      <Typography sx={{ color: color.ink }}>{ex.scenario}</Typography>
                      <Typography sx={{ mt: 0.5, color: color.muted, fontSize: '0.875rem' }}>{ex.why}</Typography>
                    </div>
                    <Chip
                      size="small"
                      color={ex.verdict === 'Free' || ex.verdict === 'No license needed' ? 'default' : 'primary'}
                      label={ex.verdict}
                      sx={{ justifySelf: { xs: 'start', sm: 'end' } }}
                    />
                  </Box>
                ))}
              </Box>
            </Disclosure>

            <Disclosure id="licenses" title="What’s licensed how">
              <Typography sx={{ mb: 2 }}>Each project has one license. Only the projects under PolyForm Noncommercial need a license for commercial use.</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) minmax(0,1fr)' }, gap: 2 }}>
                {licenseGroups.map((group) => (
                  <Box key={group.license} sx={{ bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.md}px`, p: 2.5 }}>
                    <Chip size="small" color={group.mit ? 'primary' : 'default'} label={group.license} sx={{ mb: 1.5 }} />
                    <Typography sx={{ color: color.ink, fontWeight: 600, mb: 1.5 }}>{group.summary}</Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1 }}>
                      {group.items.map((item) => (
                        <li key={item.name}>
                          {item.href ? (
                            <Box component="a" href={item.href} target="_blank" rel="noopener noreferrer" sx={underline}>
                              {item.name} ↗
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
              <Typography sx={{ mt: 2, color: color.muted, fontSize: '0.875rem' }}>
                Forks can&apos;t be relicensed. The full details are in the{' '}
                <Box component="a" href={links.licensing} target="_blank" rel="noopener noreferrer" sx={underlineNowrap}>
                  license reference ↗
                </Box>
                .
              </Typography>
            </Disclosure>

            <Disclosure id="get-a-license" title="Buying a license: what we need and what happens next">
              <Box id="what-we-need">
                <Typography sx={{ mb: 2 }}>
                  Licenses are sold to businesses and organizations, including clubs and associations, not to consumers. A license names who holds it, so we verify
                  every buyer before sending the license confirmation.
                </Typography>
                <Box component="ul" sx={list}>
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
                <Typography sx={{ mt: 2 }}>
                  We check the details before issuing the license. If something doesn&apos;t match, we&apos;ll ask, and we refund in full if we can&apos;t verify you.
                </Typography>
              </Box>
              <Typography sx={{ mt: 3, mb: 1.5, color: color.ink, fontWeight: 600 }}>
                Email{' '}
                <Box component="a" href={mailHref} sx={underline}>
                  {email}
                </Box>{' '}
                or use the buttons above, then:
              </Typography>
              <Box component="ol" sx={{ m: 0, p: 0, pl: 2.5, display: 'grid', gap: 1.5 }}>
                <li>Pay by card with the buttons above, or ask for an invoice by email. Either way you get an invoice.</li>
                <li>
                  By paying you accept the{' '}
                  <Box component="a" href={links.terms} sx={underlineNowrap}>
                    Commercial License Terms
                  </Box>{' '}
                  and{' '}
                  <Box component="a" href={links.termsOfSale} sx={underlineNowrap}>
                    Terms of Sale
                  </Box>
                  .
                </li>
                <li>We verify the details you sent us and confirm your license by email within 2 working days.</li>
              </Box>
              <Typography sx={{ mt: 2 }}>Buy it before the event. Not sure which pack fits? Email and ask, no charge for asking.</Typography>
            </Disclosure>
          </div>
        </Section>

        {/* 9 · FAQ, one question per fold. */}
        <Section id="faq" title="FAQ" pad="tight" split>
          <div>
            {faq.map((item, i) => (
              <Disclosure key={item.q} id={`faq-${i + 1}`} title={item.q}>
                <Typography component="div">{item.a}</Typography>
              </Disclosure>
            ))}
          </div>
        </Section>
      </main>
      </CheckoutProvider>
      <Footer />
    </>
  );
}
