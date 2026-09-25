import type { Metadata } from 'next';
import { H2, LegalPage } from '@/components/legal';
import { links } from '@/components/links';
import { seller } from '@/components/seller';
import { seatPrices } from '@/components/pricing';

const title = 'Commercial License Terms';
const description = 'The terms for a paid commercial license to Auto Tournament, CS2 Server Manager and Ready Up: what a seat is, the period, who may use it, refunds and liability.';

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
      <p>The option named in your license confirmation:</p>
      <ul>
        <li>
          <strong>Servers:</strong> CS2 Server Manager and Ready Up.
        </li>
        <li>
          <strong>Platform:</strong> the Auto Tournament platform, CS2 Server Manager and Ready Up. A Platform license covers the game packs used with it; there is no
          separate price for packs.
        </li>
      </ul>
      <p>
        MatchZy Enhanced (now named Auto Tournament CS2) is MIT licensed and needs no license. Selling Auto Tournament as a service (hosting or resale) isn&apos;t
        covered by these terms and needs a separate written agreement.
      </p>

      <H2 id="seats">4. Seats</H2>
      <p>
        Your license allows no more than N game servers set up at any one time during the period, spares included. N is the number of seats in your license
        confirmation.
      </p>

      <H2 id="period">5. Period</H2>
      <ul>
        <li>
          <strong>One event:</strong> the event named in the confirmation, on the dates given there, up to 5 days in a row.
        </li>
        <li>
          <strong>Yearly:</strong> 12 months from the start date in the confirmation, for any number of the licensee&apos;s own events.
        </li>
      </ul>

      <H2 id="who">6. Who may use the license</H2>
      <p>
        The license covers the named licensee and its contractors, for the named event (or, for yearly licenses, the licensee&apos;s own events). A contractor who
        uses the software for someone else&apos;s event needs its own license, or the organizer needs one that names that event.
      </p>
      <p>You can&apos;t transfer, resell or sublicense the license.</p>

      <H2 id="after">7. After the period</H2>
      <p>
        When the period ends, your commercial rights end. Your rights under PolyForm continue. To keep using the software commercially, buy a new license.
      </p>

      <H2 id="upgrades">8. Upgrades</H2>
      <p>
        Need more seats or a longer period? Email us. You pay the price difference for the extra seats or period, and we send an updated license confirmation.
      </p>

      <H2 id="start">9. When the license starts</H2>
      <p>
        We check the order details and email a written license confirmation within 2 working days of payment. The confirmation names the licensee, option, seats
        and period, and it is part of the license together with these terms.
      </p>

      <H2 id="who-pays">10. Who needs a license</H2>
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

      <H2 id="refunds">11. Refunds</H2>
      <p>
        We refund in full if we can&apos;t verify the buyer. Otherwise there are no refunds after the license is issued, except as the law requires. A cancelled
        event doesn&apos;t give a right to a refund.
      </p>

      <H2 id="liability">12. Warranty and liability</H2>
      <p>
        The software comes as is. We don&apos;t promise that it is free of errors or suits your event. Our total liability under the license is limited to the
        price you paid for it, and we aren&apos;t liable for indirect losses such as lost income or a cancelled event. These limits don&apos;t apply to damage we
        cause on purpose or through gross negligence.
      </p>

      <H2 id="breach">13. Breaking these terms</H2>
      <p>
        If you break these terms, for example by setting up more game servers than your seats, we tell you in writing. If you don&apos;t put it right within 32
        days, we may end the commercial license without a refund.
      </p>

      <H2 id="unlicensed">14. Commercial use without a license</H2>
      <p>
        If we notify you in writing that your use is commercial and unlicensed, PolyForm gives you 32 days (first notice only) to come into compliance: stop the
        commercial use or buy a license, and put right past use. To settle past use, we offer a back-dated license at the normal price plus 50%. If you don&apos;t
        come into compliance within 32 days, all your PolyForm licenses end and we may claim compensation under the Norwegian Copyright Act (åndsverkloven § 81).
      </p>

      <H2 id="law">15. Law and courts</H2>
      <p>Norwegian law applies. Disputes go to Vestre Innlandet tingrett.</p>

      <H2 id="changes">16. Changes</H2>
      <p>
        We may update these terms. A license keeps the terms that applied when it was bought. Upgrades and new licenses follow the terms in force at the time.
      </p>

      <H2 id="prices">17. Prices and contact</H2>
      <p>
        Current prices per seat: Servers €{seatPrices.servers.event} per event or €{seatPrices.servers.yearly} a year; Platform €{seatPrices.platform.event} per
        event or €{seatPrices.platform.yearly} a year. No VAT added (seller not VAT-registered). See <a href={links.pricing}>Licensing &amp; pricing</a>.
      </p>
      <p>
        Questions: <a href={`mailto:${seller.email}`}>{seller.email}</a>.
      </p>
    </LegalPage>
  );
}
