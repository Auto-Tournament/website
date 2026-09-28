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
        keep the issued keys on our server with a one-way hash of your email (not the email itself), so you can <a href={links.account}>sign in to the console</a> and
        see it again. The software checks the key offline and sends nothing to us.
      </p>
      <p id="license-email">
        <strong>The license email.</strong> We email your license key to the address you paid with, once, right after payment. The email contains the key,
        the license details above, the order reference and the invoice number. We send it through Postmark
        (see section 5). We keep when it was sent and, if sending failed, the error, but not your address.
      </p>
      <div id="console">
        <p>
          <strong>The console.</strong> At <a href="https://console.autotournament.gg">console.autotournament.gg</a> you sign in to see your licenses and manage
          your organization. There is no password. You sign in either:
        </p>
        <ul>
          <li>
            with a link we email you (through Postmark). We keep a one-way hash of the link for 15 minutes, until it is used; or
          </li>
          <li id="google">
            with Google. Google tells us your name, email address, whether Google has verified that address, and your profile picture
            address. We keep the name, email and picture link, and which Google account is yours; we don&apos;t keep Google&apos;s access tokens and we don&apos;t
            read anything else from your Google account. We accept only addresses Google has verified.
          </li>
        </ul>
        <p>
          For your account we keep your email address, your name and picture (from Google, if you used it), when your address was verified, and when you
          signed up. Once you are signed in, one cookie keeps you signed in for up to 30 days (we keep a one-way hash of it), and a second one remembers
          which of your organizations you last opened. Both are needed for the console and aren&apos;t used for anything else.
        </p>
        <p id="organizations">
          <strong>Organizations.</strong> An organization in the console is the company you buy for: its name, organization number, VAT ID, country and
          billing address, and its Stripe customer id once it has bought something. It is created from your checkout (see below), or you add it yourself. Its members see its licenses and keys, and each other&apos;s names and email
          addresses. When you invite someone, we email them a link through Postmark, and keep their email address, the role and a one-way hash of the
          link. The link works once, for 7 days; the invite is deleted 30 days after it is used, withdrawn or expired.
        </p>
        <p id="organization-from-checkout">
          <strong>The organization from your checkout.</strong> When you buy a license by card, we create the organization in the console from the
          details you entered at checkout: the company name, VAT or organization number, country and billing address, and the Stripe customer id. If you
          bought from the console for one of your organizations, or you already belong to an organization with the same VAT or organization number, the
          license goes there instead. Until you sign in, the organization is linked to the email you paid with only as a one-way hash (the same one as
          above), not the address. When you sign in with that address, verified, you become the organization&apos;s owner and the hash is deleted.
        </p>
        <p id="your-licenses">
          <strong>Licenses bought with your email.</strong> When you sign in with an address that is verified, the console shows the licenses bought with
          that address (we match the one-way hash described above) that aren&apos;t in an organization yet, so you can add them to yours.
        </p>
        <p id="audit-log">
          <strong>Activity log.</strong> To keep the console secure and to answer questions about changes, we log sign-ins and every change made in the
          console: who did it, what (such as &quot;invited a member&quot; or &quot;added a license&quot;), to which organization, and when. The log holds user and
          organization ids, not passwords, links or keys.
        </p>
        <p id="where">
          The console&apos;s data and the issued license keys are kept in a database on our own server in Norway.
        </p>
      </div>
      <p id="license-check">
        <strong>The public license check.</strong> Anyone who has a license id (it is also inside the key) can open its check page,{' '}
        <code>/verify/&lt;license id&gt;</code>, and see the licensee name, the product, pack and server limit, the kind of license, its period and whether it
        is valid. It never shows the key, your email, your Stripe customer id or the order reference. Share the id only with people who need to check your
        license, such as an event or a client.
      </p>
      <p id="contact-form">
        <strong>The contact form.</strong> On <a href="/contact">/contact</a> we collect your name, email, organization (if you give one), topic, the
        number of servers and event dates (if you give them) and your message. We send them to us by email through Postmark (see section 5), and we also
        keep them in our database, with where the conversation stands (such as &quot;replied&quot;) and our own short note, so we can follow up. We delete
        them from the database 24 months after the last activity on them (your message, or our last update to it), and the email in our mailbox when we no
        longer need it for the conversation. When we confirm a free LAN, we keep the event&apos;s name, the organizer, the dates, the number of servers
        and the day we confirmed it, as the record of that permission.
      </p>
      <p>
        The website uses no analytics and no tracking cookies. It remembers your colour theme in your own browser, and sets cookies only when you sign in to
        the console (see above). To limit abuse, the checkout, the license, sign-in and contact pages, the console and the license check keep your IP address
        in memory for up to an hour.
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
          <strong>To give you the console</strong>, with your account, your organizations and their members: the contract, or steps you ask for before one
          (GDPR art. 6(1)(b)).
        </li>
        <li>
          <strong>To stop abuse of the checkout and the console, and to keep the activity log</strong>: our legitimate interest in keeping them secure (GDPR
          art. 6(1)(f)).
        </li>
      </ul>

      <H2 id="retention">4. How long we keep it</H2>
      <p>
        Sales records, invoices and the license log: 5 years after the end of the accounting year, as the Bookkeeping Act requires. Emails that don&apos;t lead to
        a sale: deleted when we no longer need them to answer you. Contact form messages in our database: 24 months after the last activity. Your console account and your membership of organizations: until you ask us to delete
        them. An organization&apos;s details: as long as it has members, and after that as long as its licenses and invoices must be kept. Sessions end after
        30 days or when you sign out; sign-in links after 15 minutes; invites as described above. The activity log: 2 years.
      </p>

      <H2 id="recipients">5. Who gets your data</H2>
      <ul>
        <li>
          <strong>Stripe</strong> processes card payments and invoices. Stripe may transfer data to the United States, covered by the EU-US Data Privacy Framework
          and Stripe&apos;s standard contractual clauses. See <a href={links.stripePrivacy} target="_blank" rel="noopener noreferrer">Stripe&apos;s privacy policy</a>.
        </li>
        <li>
          <strong>Postmark</strong> (ActiveCampaign, LLC, USA) sends the license email, the sign-in link, invites and contact form messages for us, as our processor. It gets the
          recipient&apos;s email address and the content of those emails. Transfers to the United States are covered by the EU standard contractual clauses. We turn off open and click tracking.
        </li>
        <li>
          <strong>Google</strong>, only if you choose to sign in with Google: Google learns that you signed in to Auto Tournament. See{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s privacy policy</a>.
        </li>
        <li>Our email and hosting providers (Cloudflare carries the traffic to our server), which handle data only to run those services for us.</li>
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
