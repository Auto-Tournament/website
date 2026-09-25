import type { Metadata } from 'next';
import { H2, LegalPage } from '@/components/legal';
import { links } from '@/components/links';
import { seller } from '@/components/seller';

const title = 'Privacy Policy';
const description = 'What personal data we collect when you buy or ask about an Auto Tournament license, why, who we share it with, and your rights.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/privacy' },
  openGraph: { title, description, url: 'https://autotournament.gg/privacy' },
  twitter: { title, description },
};

export default function Privacy() {
  return (
    <LegalPage title={title} intro="This policy covers autotournament.gg and buying or asking about a commercial license.">
      <H2 id="controller">1. Who is responsible</H2>
      <p>
        {seller.name} ({seller.form}), owned by {seller.owner}, is the controller for your personal data. Contact:{' '}
        <a href={`mailto:${seller.email}`}>{seller.email}</a>.
      </p>

      <H2 id="data">2. What we collect</H2>
      <p>When you buy a license or email us about one:</p>
      <ul>
        <li>your name, and the company or organization name</li>
        <li>billing address, email and phone number</li>
        <li>organization number or VAT ID</li>
        <li>event details: name, dates, venue or city, and website</li>
        <li>what you order: option, seats, period and price</li>
        <li>
          payment data from Stripe: whether you paid, the amount, and limited card details such as the brand and last four digits (never the full card
          number)
        </li>
        <li>what you write to us</li>
      </ul>
      <p>
        The website uses no analytics and no tracking cookies. It remembers your colour theme in your own browser. To limit abuse, the checkout keeps your IP
        address in memory for about a minute.
      </p>

      <H2 id="why">3. Why, and on what legal basis</H2>
      <ul>
        <li>
          <strong>To sell and deliver the license</strong> and answer your questions about it: the contract, or steps you ask for before one (GDPR art. 6(1)(b)).
        </li>
        <li>
          <strong>To keep the accounts</strong> the law requires: a legal obligation (GDPR art. 6(1)(c)) under the Bookkeeping Act (bokføringsloven).
        </li>
        <li>
          <strong>To stop abuse of the checkout</strong>: our legitimate interest (GDPR art. 6(1)(f)).
        </li>
      </ul>

      <H2 id="retention">4. How long we keep it</H2>
      <p>
        Sales records, invoices and the license log: 5 years after the end of the accounting year, as the Bookkeeping Act requires. Emails that don&apos;t lead to
        a sale: deleted when we no longer need them to answer you.
      </p>

      <H2 id="recipients">5. Who gets your data</H2>
      <ul>
        <li>
          <strong>Stripe</strong> processes card payments and invoices. Stripe may transfer data to the United States, covered by the EU-US Data Privacy Framework
          and Stripe&apos;s standard contractual clauses. See <a href={links.stripePrivacy} target="_blank" rel="noopener noreferrer">Stripe&apos;s privacy policy</a>.
        </li>
        <li>Our email and hosting providers, which handle data only to run those services for us.</li>
        <li>An accountant, if we use one, and public authorities when the law requires it.</li>
      </ul>
      <p>We don&apos;t sell your data or use it for marketing.</p>

      <H2 id="rights">6. Your rights</H2>
      <p>
        You can ask for access to your data, and to have it corrected, deleted, restricted or handed over in a machine-readable format. You can object to
        processing based on our legitimate interest. Email <a href={`mailto:${seller.email}`}>{seller.email}</a>. We may need to keep some data to meet the
        Bookkeeping Act.
      </p>
      <p>
        You can complain to the Norwegian Data Protection Authority, <a href={links.datatilsynet} target="_blank" rel="noopener noreferrer">Datatilsynet</a>.
      </p>
    </LegalPage>
  );
}
