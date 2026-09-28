import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPacks } from '@/lib/stripePrices';
import { CheckoutPreview } from './CheckoutPreview';

// Development only: the checkout dialog in every state, with a mock of
// Stripe's form, so the design can be checked without Stripe keys. 404 in
// production builds.
export const metadata: Metadata = { title: 'Checkout preview', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { packs } = await getPacks();
  return <CheckoutPreview packs={[...packs]} />;
}
