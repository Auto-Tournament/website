/*
 * Hallmark · macrostructure: Product page (hero + facts → split sections → commercial use → links)
 * genre: modern-minimal · theme: Auto Tournament system (src/theme/tokens.ts, Sora + Geist) · nav: N5 · footer: Ft5
 */
import type { Metadata } from 'next';
import { Footer, Nav } from '@/components/sections';
import { Blocks, CommercialUse, MoreLinks, ProductHero } from '@/components/product/ProductParts';
import { platform } from '@/content/catalog';

const title = 'The Auto Tournament platform';

export const metadata: Metadata = {
  title,
  description: platform.description,
  alternates: { canonical: '/platform' },
  openGraph: { title, description: platform.description, url: 'https://autotournament.gg/platform' },
  twitter: { title, description: platform.description },
};

export default function PlatformPage() {
  return (
    <>
      <Nav />
      <main>
        <ProductHero product={platform} />
        <Blocks blocks={platform.sections} />
        <CommercialUse extra={platform.licenseExtra} />
        <MoreLinks items={platform.more} />
      </main>
      <Footer />
    </>
  );
}
