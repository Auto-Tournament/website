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
        <li>what you order: pack, number of servers, period and price</li>
        <li>
          payment data from Stripe: whether you paid, the amount, and limited card details such as the brand and last four digits (never the full card
          number)
        </li>
        <li>what you write to us</li>
      </ul>
      <p id="license-key">
        <strong>Your license key.</strong> When you pay by card, we issue a signed license key that you paste into the software. It contains a license id, your
        Stripe customer id, the business name you gave at checkout, the product, pack and server limit, the period, when it was issued, how long updates run
        and, for one event, the event dates. It doesn&apos;t contain your email, name or address, but anyone you give the key to can read what it contains. We
        keep the issued keys on our server with a one-way hash of your email (not the email itself), so you can <a href="/license">get your key again</a>. The
        software checks the key offline and sends nothing to us.
      </p>
      <p id="license-email">
        <strong>The license email.</strong> We email your license key to the address you paid with, once, right after payment, and again when you ask for it
        on the license page. The email contains the key, the license details above, the order reference and the invoice number. We send it through Postmark
        (see section 5). We keep when it was sent and, if sending failed, the error, but not your address.
      </p>
      <p id="account">
        <strong>Your licenses page.</strong> On <a href="/account">/account</a> you sign in with a link we email you (through Postmark), with no password. We
        keep a one-way hash of the link for 15 minutes and, once you sign in, a hash of your session with the hash of your email for up to 30 days, or until
        you sign out. One cookie keeps you signed in; it is needed for the sign-in and isn&apos;t used for anything else.
      </p>
      <p id="license-check">
        <strong>The public license check.</strong> Anyone who has a license id (it is also inside the key) can open its check page,{' '}
        <code>/verify/&lt;license id&gt;</code>, and see the licensee name, the product, pack and server limit, the kind of license, its period and whether it
        is valid. It never shows the key, your email, your Stripe customer id or the order reference. Share the id only with people who need to check your
        license, such as an event or a client.
      </p>
      <p>
        The website uses no analytics and no tracking cookies. It remembers your colour theme in your own browser, and sets one cookie only when you sign in
        to your licenses. To limit abuse, the checkout, the license and sign-in pages and the license check keep your IP address in memory for up to an hour.
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
        <li>
          <strong>Postmark</strong> (ActiveCampaign, LLC, USA) sends the license email and the sign-in link for us, as our processor. It gets your email
          address and the content of those emails. Transfers to the United States are covered by the EU standard contractual clauses. We turn off open and click tracking.
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
