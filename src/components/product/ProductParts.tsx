'use client';

/*
 * Hallmark · component: product pages (games list, game page, tool page, platform page)
 * genre: modern-minimal · theme: Auto Tournament system (src/theme/tokens.ts, Sora + Geist) · nav: N5 · footer: Ft5
 * states: links hover (paper3 / ink) · focus (theme ring) · no loading or error states (static content)
 * contrast: ink / ink2 on paper and paper2, accentInk on accent
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { ArrowRight } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { Coins } from '@phosphor-icons/react/dist/csr/Coins';
import { HardDrives } from '@phosphor-icons/react/dist/csr/HardDrives';
import { PaintBrush } from '@phosphor-icons/react/dist/csr/PaintBrush';
import { Plugs } from '@phosphor-icons/react/dist/csr/Plugs';
import { PlayCircle } from '@phosphor-icons/react/dist/csr/PlayCircle';
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { ChartBar } from '@phosphor-icons/react/dist/csr/ChartBar';
import { Target } from '@phosphor-icons/react/dist/csr/Target';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import type { Badge, Block, FeatureGroup, Game, IconKey, LinkOut, Product } from '@/content/catalog';
import { gamePath, licensing, toolPath } from '@/content/catalog';
import { AtIcon } from '../AtIcon';
import { CodeBlock } from '../CodeBlock';
import { links } from '../links';

const { color, radius } = tokens;

export const underline = { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule, textUnderlineOffset: '0.15em' } as const;

const bullet = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 1.5,
  '&::before': { content: '""', width: 6, height: 6, mt: '0.6em', borderRadius: '50%', bgcolor: color.accent, flex: 'none' },
} as const;

const isExternal = (href: string) => /^https?:\/\//.test(href);
const outProps = (href: string) => (isExternal(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {});

/** A text link; one that leaves the site opens a new tab and carries an arrow. */
export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Box component="a" href={href} {...outProps(href)} sx={underline}>
      {children}
      {isExternal(href) ? ' ↗' : ''}
    </Box>
  );
}

/** A button that leaves the site gets the arrow and opens a new tab, like the nav's Install. */
export function LinkButton({ link, variant = 'outlined' }: { link: LinkOut; variant?: 'contained' | 'outlined' }) {
  const out = isExternal(link.href);
  return (
    <Button variant={variant} href={link.href} {...outProps(link.href)} endIcon={out ? <ArrowUpRight size={14} weight="bold" aria-hidden /> : undefined}>
      {link.label}
    </Button>
  );
}

export function BadgeChip({ badge }: { badge: Badge }) {
  const tone = {
    stable: { bgcolor: color.accent, color: color.accentInk, border: `1px solid ${color.accent}` },
    free: { bgcolor: 'transparent', color: color.live, border: `1px solid ${color.live}` },
    beta: { bgcolor: 'transparent', color: color.warn, border: `1px solid ${color.warn}` },
    soon: { bgcolor: color.paper3, color: color.ink2, border: `1px dashed ${color.muted}` },
  }[badge.tone];
  return <Chip size="small" label={badge.label} sx={{ ...tone, height: 24 }} />;
}

export function Badges({ badges }: { badges: Badge[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {badges.map((b) => (
        <BadgeChip key={b.label} badge={b} />
      ))}
    </Box>
  );
}

const icons: Record<Exclude<IconKey, 'platform'>, typeof Plugs> = {
  readyUp: CheckCircle,
  csm: HardDrives,
  skins: PaintBrush,
  midas: Coins,
  plugin: Plugs,
};

/** The product's mark: the Auto Tournament ram for the platform, an icon on a tile for the tools. */
export function ProductIcon({ icon, size = 56 }: { icon: IconKey; size?: number }) {
  if (icon === 'platform') {
    return (
      <Box sx={{ width: size, height: size, flex: 'none', borderRadius: `${Math.round(size * 0.23)}px`, overflow: 'hidden' }}>
        <AtIcon size="100%" />
      </Box>
    );
  }
  const Icon = icons[icon];
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: `${Math.round(size * 0.23)}px`,
        bgcolor: color.paper3,
        border: `1px solid ${color.rule}`,
        color: color.accent,
      }}
    >
      <Icon size={Math.round(size * 0.5)} weight="duotone" />
    </Box>
  );
}

/** Games / Counter-Strike 2 / Ready Up. The last item is the current page. */
export function Crumbs({ items }: { items: LinkOut[] }) {
  return (
    <Box component="nav" aria-label="Breadcrumb" sx={{ mb: 3 }}>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1, color: color.muted, fontSize: '0.875rem' }}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Box component="li" key={item.href} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              {last ? (
                <Box component="span" aria-current="page" sx={{ color: color.ink2 }}>
                  {item.label}
                </Box>
              ) : (
                <>
                  <Box component="a" href={item.href} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: color.ink } }}>
                    {item.label}
                  </Box>
                  <span aria-hidden>/</span>
                </>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** The top of a product page: mark, kind, badges, name, tagline, summary, two buttons, and the facts beside it. */
export function ProductHero({ product, crumbs }: { product: Product; crumbs?: LinkOut[] }) {
  return (
    <Container maxWidth="lg" component="section" sx={{ pt: { xs: 8, md: 13 }, pb: { xs: 6, md: 9 } }}>
      {crumbs && <Crumbs items={crumbs} />}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1.35fr) minmax(0,1fr)' },
          gap: { xs: 5, md: 8 },
          alignItems: 'end',
        }}
      >
        <div>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <ProductIcon icon={product.icon} />
            <Box sx={{ display: 'grid', gap: 0.75 }}>
              <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>{product.kind}</Typography>
              <Badges badges={product.badges} />
            </Box>
          </Box>
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.5rem, 3.4vw + 1rem, 4.25rem)' }}>
            {product.name}
          </Typography>
          <Typography sx={{ mt: 2, fontFamily: fontDisplay, fontWeight: 600, fontSize: 'clamp(1.25rem, 0.8vw + 1rem, 1.625rem)', lineHeight: 1.25, color: color.accent, maxWidth: '30ch' }}>
            {product.tagline}
          </Typography>
          <Typography sx={{ mt: 3, maxWidth: '56ch', color: color.ink2, fontSize: '1.0625rem' }}>{product.summary}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 4 }}>
            <LinkButton link={product.primary} variant="contained" />
            {product.secondary && <LinkButton link={product.secondary} />}
          </Box>
        </div>
        <Box
          component="dl"
          sx={{ m: 0, bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, p: { xs: 2.5, md: 3 }, display: 'grid', gap: 2 }}
        >
          {product.facts.map((f, i) => (
            <Box key={f.label} sx={{ display: 'grid', gap: 0.25, pt: i ? 2 : 0, borderTop: i ? `1px solid ${color.rule}` : 'none' }}>
              <Box component="dt" sx={{ color: color.muted, fontSize: '0.8125rem' }}>
                {f.label}
              </Box>
              <Box component="dd" sx={{ m: 0, color: color.ink, fontWeight: 500 }}>
                {f.href ? (
                  <Box component="a" href={f.href} sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule, textUnderlineOffset: '0.2em', '&:hover': { color: color.accent } }}>
                    {f.value}
                  </Box>
                ) : (
                  f.value
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Container>
  );
}

/** One section of a product page: heading on the left (it stays in view on desktop), text on the right. */
export function BlockSection({ block }: { block: Block }) {
  return (
    <Container
      maxWidth="lg"
      component="section"
      id={block.id}
      aria-labelledby={`${block.id}-title`}
      sx={{
        py: { xs: 5, md: 7 },
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) minmax(0,1.9fr)' },
        columnGap: { md: 8 },
        rowGap: 2.5,
        alignItems: 'start',
      }}
    >
      <Box sx={{ position: { md: 'sticky' }, top: { md: 112 }, display: 'grid', gap: 1.5, justifyItems: 'start' }}>
        <Typography id={`${block.id}-title`} variant="h3" component="h2" sx={{ fontSize: 'clamp(1.375rem, 1vw + 1rem, 1.75rem)' }}>
          {block.title}
        </Typography>
        {block.badge && <BadgeChip badge={block.badge} />}
      </Box>
      <Box sx={{ display: 'grid', gap: 2, minWidth: 0, maxWidth: '44rem', color: color.ink2 }}>
        {block.body.map((p) => (
          <Typography key={p.slice(0, 40)} sx={{ color: 'inherit' }}>
            {p}
          </Typography>
        ))}
        {block.points && (
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
            {block.points.map((pt) => (
              <Box component="li" key={pt} sx={bullet}>
                <span>{pt}</span>
              </Box>
            ))}
          </Box>
        )}
        {block.code && <CodeBlock code={block.code.code} comment={block.code.comment} what={block.code.what} />}
        {block.note && <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>{block.note}</Typography>}
        {block.links && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 1, fontSize: '0.9375rem' }}>
            {block.links.map((l) => (
              <TextLink key={l.href} href={l.href}>
                {l.label}
              </TextLink>
            ))}
          </Box>
        )}
      </Box>
    </Container>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <Box sx={{ '& > section + section': { borderTop: `1px solid ${color.rule}` } }}>
      {blocks.map((b) => (
        <BlockSection key={b.id} block={b} />
      ))}
    </Box>
  );
}

/**
 * Commercial use, the same words on every product page (licensing in the
 * catalog): free for non-commercial use, and a license when you earn money
 * from your event. `extra` is the product's own counting rule.
 */
export function CommercialUse({ extra, mit }: { extra?: string[]; mit?: React.ReactNode }) {
  return (
    <Container maxWidth="lg" component="section" id="commercial-use" aria-labelledby="commercial-use-title" sx={{ py: { xs: 6, md: 9 } }}>
      <Box
        sx={{
          bgcolor: color.paper2,
          border: `1px solid ${color.rule}`,
          borderRadius: `${radius.lg}px`,
          p: { xs: 3, md: 5 },
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,1fr) minmax(0,1.4fr)' },
          gap: { xs: 3, md: 6 },
        }}
      >
        <div>
          <Typography id="commercial-use-title" variant="h2" sx={{ fontSize: 'clamp(1.75rem, 1.6vw + 1rem, 2.25rem)' }}>
            {licensing.headline}
          </Typography>
          <Typography sx={{ mt: 1.5, color: color.ink2, fontSize: '1.0625rem' }}>{licensing.who}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 3 }}>
            <Button variant="contained" href={links.pricing}>
              See pricing
            </Button>
            <Button variant="outlined" href={links.verify}>
              Check a license
            </Button>
          </Box>
        </div>
        <Box sx={{ display: 'grid', gap: 2, color: color.ink2 }}>
          <Typography sx={{ color: color.ink, fontWeight: 600 }}>
            {licensing.earning} <TextLink href={links.pricing}>See pricing</TextLink>
          </Typography>
          {extra?.map((line) => (
            <Typography key={line} sx={{ color: 'inherit' }}>
              {line}
            </Typography>
          ))}
          <Typography sx={{ color: 'inherit' }}>The license key is checked offline and never blocks, disables or slows anything.</Typography>
          {mit && <Typography sx={{ color: color.muted, fontSize: '0.9375rem' }}>{mit}</Typography>}
          <Typography sx={{ color: color.muted, fontSize: '0.9375rem' }}>
            The details are in <TextLink href={links.licensing}>the license reference</TextLink>. Questions: <TextLink href={links.contact}>contact us</TextLink>.
          </Typography>
        </Box>
      </Box>
    </Container>
  );
}

/** A card that links to a tool's page. */
export function ToolCard({ game, tool }: { game: Game; tool: Product }) {
  return (
    <Box
      component="a"
      href={toolPath(game, tool)}
      sx={{
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto',
        gap: 1.5,
        p: 3,
        bgcolor: color.paper2,
        border: `1px solid ${color.rule}`,
        borderRadius: `${radius.lg}px`,
        color: 'inherit',
        textDecoration: 'none',
        '&:hover': { bgcolor: color.paper3 },
        '&:hover .go': { color: color.accent },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ProductIcon icon={tool.icon} size={40} />
        <div>
          <Typography variant="h3" component="h3" sx={{ fontSize: '1.25rem' }}>
            {tool.name}
          </Typography>
          <Typography sx={{ color: color.muted, fontSize: '0.8125rem' }}>{tool.kind}</Typography>
        </div>
      </Box>
      <Badges badges={tool.badges} />
      <Typography sx={{ color: color.ink2, fontSize: '0.9375rem' }}>{tool.tagline}</Typography>
      <Box className="go" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: color.ink, fontSize: '0.875rem', fontWeight: 600 }}>
        Read more <ArrowRight size={14} weight="bold" aria-hidden />
      </Box>
    </Box>
  );
}

/** The other tools for the same game, at the bottom of a tool page. */
export function MoreForGame({ game, current }: { game: Game & { tools: Product[] }; current: string }) {
  const others = game.tools.filter((t) => t.slug !== current);
  if (others.length === 0) return null;
  return (
    <Container maxWidth="lg" component="section" aria-labelledby="more-title" sx={{ py: { xs: 6, md: 9 } }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 4 }}>
        <Typography id="more-title" variant="h2" sx={{ fontSize: 'clamp(1.75rem, 1.6vw + 1rem, 2.25rem)' }}>
          More for {game.name}
        </Typography>
        <TextLink href={gamePath(game)}>All {game.name} tools</TextLink>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))', gap: 2 }}>
        {others.map((t) => (
          <ToolCard key={t.slug} game={game} tool={t} />
        ))}
      </Box>
    </Container>
  );
}

const featureGroupIcons: Record<FeatureGroup['icon'], typeof Plugs> = {
  match: PlayCircle,
  admins: ShieldCheck,
  after: ChartBar,
  practice: Target,
};

/**
 * What Ready Up does in a match, grouped for organizers and players. Each
 * item names the plugin behind it small and secondary — that's an
 * implementation detail, not the headline.
 */
export function FeatureGroups({ intro, groups }: { intro: string; groups: FeatureGroup[] }) {
  return (
    <Container maxWidth="lg" component="section" aria-labelledby="features-title" sx={{ py: { xs: 5, md: 8 } }}>
      <Typography id="features-title" variant="h2" sx={{ fontSize: 'clamp(1.75rem, 1.6vw + 1rem, 2.25rem)', maxWidth: '30ch' }}>
        What Ready Up does
      </Typography>
      <Typography sx={{ mt: 1.5, maxWidth: '56ch', color: color.ink2, fontSize: '1.0625rem' }}>{intro}</Typography>
      <Box sx={{ mt: 5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))' }, gap: { xs: 4, md: 5 } }}>
        {groups.map((group) => {
          const Icon = featureGroupIcons[group.icon];
          return (
            <Box key={group.id} component="section" aria-labelledby={`${group.id}-title`}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 40,
                    height: 40,
                    flex: 'none',
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: `${radius.md}px`,
                    bgcolor: color.paper3,
                    border: `1px solid ${color.rule}`,
                    color: color.accent,
                  }}
                >
                  <Icon size={20} weight="duotone" />
                </Box>
                <Typography id={`${group.id}-title`} variant="h3" component="h3" sx={{ fontSize: '1.1875rem' }}>
                  {group.title}
                </Typography>
              </Box>
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
                {group.items.map((item) => (
                  <Box
                    component="li"
                    key={item.title}
                    sx={{ p: 2.5, bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.md}px` }}
                  >
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 0.75 }}>
                      <Typography sx={{ color: color.ink, fontWeight: 600 }}>{item.title}</Typography>
                      {item.status && <BadgeChip badge={item.status} />}
                    </Box>
                    <Typography sx={{ color: color.ink2, fontSize: '0.9375rem' }}>{item.text}</Typography>
                    <Typography sx={{ mt: 1, color: color.muted, fontSize: '0.75rem' }}>plugin: {item.plugin}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Container>
  );
}

/** Links at the end of a page. */
export function MoreLinks({ items }: { items: LinkOut[] }) {
  return (
    <Container maxWidth="lg" sx={{ pb: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 1, color: color.muted, fontSize: '0.9375rem' }}>
        {items.map((l) => (
          <TextLink key={l.href} href={l.href}>
            {l.label}
          </TextLink>
        ))}
      </Box>
    </Container>
  );
}
