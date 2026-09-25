import type { Metadata } from 'next';
import { H2, LegalPage } from '@/components/legal';
import { links } from '@/components/links';
import { seller } from '@/components/seller';

const title = 'Terms of Sale';
const description = 'How we sell Auto Tournament commercial licenses: business customers only, prices without VAT, payment by Stripe or invoice, delivery and complaints.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/terms-of-sale' },
  openGraph: { title, description, url: 'https://autotournament.gg/terms-of-sale' },
  twitter: { title, description },
};

export default function TermsOfSale() {
  return (
    <LegalPage
      title={title}
      intro={
        <>
          These terms cover buying a commercial license. What the license allows is in the <a href={links.terms}>Commercial License Terms</a>.
        </>
      }
    >
      <H2 id="seller">1. Seller</H2>
      <p>
        {seller.name} ({seller.form}), a sole proprietorship owned by {seller.owner}, org. nr. {seller.orgNumber}, {seller.address},{' '}
        <a href={`mailto:${seller.email}`}>{seller.email}</a>. Registered in Enhetsregisteret. Not VAT-registered.
      </p>

      <H2 id="business-only">2. Business customers only</H2>
      <p>
        We sell licenses only to businesses and organizations, including clubs and associations, buying for their activity. We don&apos;t sell to consumers. When
        you order, you confirm that you are buying for a business or organization, not as a consumer, and you give its name. Because of this, the Consumer
        Purchases Act (forbrukerkjøpsloven) and the Cancellation Act (angrerettloven) don&apos;t apply, and there is no right of withdrawal.
      </p>
      <p>Personal and hobby use needs no license: it is free under PolyForm&apos;s personal-use terms.</p>

      <H2 id="order">3. What you buy</H2>
      <p>
        A commercial license pack (Servers or Platform, size S, M or L) for the period you choose (one event, yearly, or founding supporter), on the{' '}
        <a href={links.terms}>Commercial License Terms</a>. By paying you accept the Commercial License Terms and these Terms of Sale.
      </p>

      <H2 id="prices">4. Prices and VAT</H2>
      <p>
        Each pack has a fixed price in euro, as shown on <a href={links.pricing}>Licensing &amp; pricing</a> when you order. No VAT added (seller not VAT-registered). Any
        tax you owe as the buyer in your own country, such as reverse-charge VAT, is yours to handle.
      </p>

      <H2 id="payment">5. Payment</H2>
      <p>
        Pay by card through Stripe Checkout, or ask for an invoice by email. Stripe handles the card payment; we never see your full card number. You get an
        invoice either way. Invoices are due on the date shown on them.
      </p>

      <H2 id="delivery">6. Delivery</H2>
      <p>
        Nothing is shipped: the software is downloaded from its public repositories. We check your order details and email your license confirmation within 2
        working days of payment. If we can&apos;t verify your details, we refuse the order and refund you in full.
      </p>

      <H2 id="refunds">7. Refunds</H2>
      <p>
        We refund in full if we can&apos;t verify the buyer. Otherwise there are no refunds after the license is issued, except as the law requires.
      </p>

      <H2 id="complaints">8. Complaints</H2>
      <p>
        If something is wrong with your order or license confirmation, email <a href={`mailto:${seller.email}`}>{seller.email}</a> as soon as you notice. We
        reply within 5 working days and correct any mistake in the confirmation or invoice free of charge.
      </p>

      <H2 id="law">9. Law and courts</H2>
      <p>Norwegian law applies. Disputes go to Vestre Innlandet tingrett.</p>

      <H2 id="privacy">10. Your data</H2>
      <p>
        How we handle the details you give us is in the <a href={links.privacy}>Privacy Policy</a>.
      </p>
    </LegalPage>
  );
}
