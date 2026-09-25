import type { Metadata } from 'next';
import { H2, LegalPage } from '@/components/legal';
import { links } from '@/components/links';
import { seller } from '@/components/seller';
import { PACKS, formatEuro, founderDeadline, founderLimit, founderUpdateWarning, maxPackServers } from '@/components/pricing';

const title = 'Commercial License Terms';
const description = 'The terms for a paid commercial license to Auto Tournament, CS2 Server Manager and Ready Up: packs and their server limits, the period, founding supporter packs, who may use it, refunds and liability.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/terms' },
  openGraph: { title, description, url: 'https://autotournament.gg/terms' },
  twitter: { title, description },
};

export default function Terms() {
  return (
    <LegalPage
      title={title}
      intro={
        <>
          These terms apply to every paid commercial license for Auto Tournament. Buying is also covered by the <a href={links.termsOfSale}>Terms of Sale</a>.
        </>
      }
    >
      <H2 id="parties">1. Who these terms are between</H2>
      <p>
        {seller.owner}, trading as {seller.name} ({seller.form}, org. nr. {seller.orgNumber}), &ldquo;we&rdquo;, and the business or organization named as the licensee
        in the license confirmation, &ldquo;you&rdquo;.
      </p>

      <H2 id="polyform">2. How this license relates to PolyForm</H2>
      <p>
        The software is published under the <a href={links.polyform} target="_blank" rel="noopener noreferrer">PolyForm Noncommercial License 1.0.0</a>, which allows non-commercial use for free. A commercial
        license adds the right to use the software commercially, within the limits below. Everything else stays under PolyForm. Where these terms and PolyForm
        differ on your commercial use, these terms apply.
      </p>

      <H2 id="software">3. What software is covered</H2>
      <p>The pack named in your license confirmation:</p>
      <ul>
        <li>
          <strong>Servers packs (S, M, L):</strong> CS2 Server Manager and Ready Up.
        </li>
        <li>
          <strong>Platform packs (S, M, L):</strong> the Auto Tournament platform, CS2 Server Manager and Ready Up. A Platform pack covers the game packs used with
          it; there is no separate price for game packs.
        </li>
      </ul>
      <p>
        MatchZy Enhanced (now named Auto Tournament CS2) is MIT licensed and needs no license. Selling Auto Tournament as a service (hosting or resale) isn&apos;t
        covered by these terms and needs a separate written agreement.
      </p>

      <H2 id="packs">4. Packs and server limits</H2>
      <p>
        Your pack allows no more than its number of game servers set up at any one time during the period, spares included: S up to 5, M up to 15, L up to{' '}
        {maxPackServers}. The pack and its server limit are in your license confirmation.
      </p>
      <ul>
        <li>One pack per event, or per 12 months for a yearly pack.</li>
        <li>
          Packs can&apos;t be combined or stacked: two S packs don&apos;t make an M. Servers and Platform packs can&apos;t be combined either; Platform already
          includes the servers.
        </li>
        <li>More than {maxPackServers} servers needs a separate written agreement.</li>
      </ul>

      <H2 id="period">5. Period</H2>
      <ul>
        <li>
          <strong>One event:</strong> the event named in the confirmation, on the dates given there, up to 5 days in a row.
        </li>
        <li>
          <strong>Yearly:</strong> 12 months from the start date in the confirmation, for any number of the licensee&apos;s own events.
        </li>
        <li>
          <strong>Founding supporter:</strong> see section 6.
        </li>
      </ul>

      <H2 id="founding-supporter">6. Founding supporter packs</H2>
      <p>
        Founding supporter packs are sold to the first {founderLimit} buyers, or until {founderDeadline}, whichever comes first. We may refuse and refund an order
        that comes after that.
      </p>
      <ul>
        <li>
          You get perpetual commercial use, for the licensee&apos;s own events, of every version released within 12 months of the purchase date, including 1 year
          of updates.
        </li>
        <li>
          After that, renewing updates is optional, at the yearly price of the same pack. A renewal restores updates for 12 months.
        </li>
        <li>Without renewal, you keep using the versions released within the first 12 months.</li>
        <li>
          The pack&apos;s server limit stays the same; a founding supporter pack doesn&apos;t grow. To move to a bigger founding supporter pack, you pay the
          difference, while founding supporter packs are still for sale.
        </li>
        <li>{founderUpdateWarning}. We don&apos;t promise that an older version keeps working after a CS2 update.</li>
      </ul>

      <H2 id="who">7. Who may use the license</H2>
      <p>
        The license covers the named licensee and its contractors, for the named event (or, for yearly and founding supporter packs, the licensee&apos;s own
        events). A contractor who uses the software for someone else&apos;s event needs its own license, or the organizer needs one that names that event.
      </p>
      <p>You can&apos;t transfer, resell or sublicense the license.</p>

      <H2 id="after">8. After the period</H2>
      <p>
        When the period of an event or yearly pack ends, your commercial rights end. Founding supporter packs follow section 6. Your rights under PolyForm
        continue. To keep using the software commercially, buy a new license.
      </p>

      <H2 id="upgrades">9. Upgrades</H2>
      <p>
        Need more servers during the period? Email us before you set them up. You upgrade to the next pack size and pay the price difference, and we send an
        updated license confirmation.
      </p>

      <H2 id="start">10. When the license starts</H2>
      <p>
        We check the order details and email a written license confirmation within 2 working days of payment. The confirmation names the licensee, pack (with its
        server limit) and period, and it is part of the license together with these terms.
      </p>

      <H2 id="who-pays">11. Who needs a license</H2>
      <p>
        If you earn money from it, you pay full price. That includes an organizer who makes a profit, any business, and a paid operator or contractor, even one
        hired by an event that is itself free.
      </p>
      <p>
        No license is needed when nobody earns money from it: all entry fees and sponsor money go back into the event, and no organizer, volunteer or helper is
        paid or takes profit. Personal and hobby use is free under PolyForm&apos;s personal-use terms. Organizers of such events can ask us for a free written
        confirmation; it is optional.
      </p>
      <p>
        Paid operators must name the event or client they work for when buying. We may contact organizers of larger events (for example 20+ servers, ticket
        sales or sponsors) to ask whether the use is commercial.
      </p>
      <p>
        Charities, schools and universities, public research, public safety or health and environmental protection organizations, and government bodies need no
        license: PolyForm lets them use the software free, even when they charge entry.
      </p>

      <H2 id="refunds">12. Refunds</H2>
      <p>
        We refund in full if we can&apos;t verify the buyer. Otherwise there are no refunds after the license is issued, except as the law requires. A cancelled
        event doesn&apos;t give a right to a refund.
      </p>

      <H2 id="liability">13. Warranty and liability</H2>
      <p>
        The software comes as is. We don&apos;t promise that it is free of errors or suits your event. Our total liability under the license is limited to the
        price you paid for it, and we aren&apos;t liable for indirect losses such as lost income or a cancelled event. These limits don&apos;t apply to damage we
        cause on purpose or through gross negligence.
      </p>

      <H2 id="breach">14. Breaking these terms</H2>
      <p>
        If you break these terms, for example by setting up more game servers than your pack allows, we tell you in writing. If you don&apos;t put it right within 32
        days, we may end the commercial license without a refund.
      </p>

      <H2 id="unlicensed">15. Commercial use without a license</H2>
      <p>
        If we notify you in writing that your use is commercial and unlicensed, PolyForm gives you 32 days (first notice only) to come into compliance: stop the
        commercial use or buy a license, and put right past use. To settle past use, we offer a back-dated license at the normal price plus 50%. If you don&apos;t
        come into compliance within 32 days, all your PolyForm licenses end and we may claim compensation under the Norwegian Copyright Act (åndsverkloven § 81).
      </p>

      <H2 id="law">16. Law and courts</H2>
      <p>Norwegian law applies. Disputes go to Vestre Innlandet tingrett.</p>

      <H2 id="changes">17. Changes</H2>
      <p>
        We may update these terms. A license keeps the terms that applied when it was bought. Upgrades and new licenses follow the terms in force at the time.
      </p>
      <p>Licenses bought under Pricing v1 (per seat, 25 September 2026) keep their terms.</p>

      <H2 id="prices">18. Prices and contact</H2>
      <p>
        Current prices (Pricing v2, valid from 25 September 2026), per event, yearly and founding supporter:{' '}
        {PACKS.map((p) => `${p.name} (up to ${p.maxServers} servers) ${formatEuro(p.prices.event)}, ${formatEuro(p.prices.year)}, ${formatEuro(p.prices.founder)}`).join('; ')}.
        No VAT added (seller not VAT-registered). See <a href={links.pricing}>Licensing &amp; pricing</a>.
      </p>
      <p>
        Questions: <a href={`mailto:${seller.email}`}>{seller.email}</a>.
      </p>
    </LegalPage>
  );
}
