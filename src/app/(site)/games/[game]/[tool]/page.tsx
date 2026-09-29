/*
 * Hallmark · macrostructure: Product page (breadcrumb → hero + facts → split sections → commercial use → more for this game)
 * genre: modern-minimal · theme: Auto Tournament system (src/theme/tokens.ts, Sora + Geist) · nav: N5 · footer: Ft5
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Blocks, CommercialUse, MoreForGame, MoreLinks, ProductHero } from '@/components/product/ProductParts';
import { findTool, gamePath, gamesWithPages, toolPath } from '@/content/catalog';

type Params = { game: string; tool: string };

// Only the pages in the catalog exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return gamesWithPages.flatMap((g) => g.tools.map((t) => ({ game: g.slug, tool: t.slug })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = findTool((await params).game, (await params).tool);
  if (!found) return {};
  const { game, tool } = found;
  const title = `${tool.name} for ${game.name}`;
  const url = toolPath(game, tool);
  return {
    title,
    description: tool.description,
    alternates: { canonical: url },
    openGraph: { title, description: tool.description, url: `https://autotournament.gg${url}` },
    twitter: { title, description: tool.description },
  };
}

export default async function ToolPage({ params }: { params: Promise<Params> }) {
  const { game: gameSlug, tool: toolSlug } = await params;
  const found = findTool(gameSlug, toolSlug);
  if (!found) notFound();
  const { game, tool } = found;
  return (
    <>
      <main>
        <ProductHero
          product={tool}
          crumbs={[
            { label: 'Games', href: '/games' },
            { label: game.name, href: gamePath(game) },
            { label: tool.name, href: toolPath(game, tool) },
          ]}
        />
        <Blocks blocks={tool.sections} />
        <CommercialUse extra={tool.licenseExtra} />
        <MoreForGame game={game} current={tool.slug} />
        <MoreLinks items={tool.more} />
      </main>
    </>
  );
}
