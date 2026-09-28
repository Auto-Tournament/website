'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { ThemePicker } from './ThemePicker';
import { links } from './links';
import { siteHref } from './nav/navItems';
import { seller } from './seller';

const { color } = tokens;

/*
 * Ft5 statement. The console renders it too: `site` is the main site's origin
 * on the console's own host ('' elsewhere) so the links lead back to it, and
 * `consoleHome` points the Console link straight at the console.
 */
export function Footer({ site = '', consoleHome }: { site?: string; consoleHome?: string } = {}) {
  const href = (path: string) => siteHref(path, site);
  return (
    <Container maxWidth="lg" component="footer" sx={{ pt: { xs: 10, md: 16 }, pb: 6, mt: 6, borderTop: `1px solid ${color.rule}` }}>
      <Typography sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 'clamp(1.9rem, 2.2vw + 1rem, 2.75rem)', letterSpacing: '-0.03em', lineHeight: 1.1, maxWidth: '20ch' }}>
        Made by people who run LANs, for people who run LANs.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 2, mt: 6, color: color.muted, fontSize: '0.875rem' }}>
        <Box component="nav" id="site-links" aria-label="Footer" sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {[
            ['Pricing', href(links.pricing)],
            ['CS2 compatibility', href(links.compatibility)],
            ['Check a license', href(links.verify)],
            ['Console', consoleHome ?? href(links.account)],
            ['Contact', href(links.contact)],
            ['Docs', links.docs],
            ['GitHub', links.github],
            ['Discord', links.discord],
          ].map(([label, to]) => (
            <Box key={label} component="a" href={to} sx={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap', '&:hover': { color: color.ink } }}>
              {label}
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <ThemePicker />
          <Box component="a" href={links.licensing} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: color.ink } }}>
            Free for non-commercial use · Licensing
          </Box>
        </Box>
      </Box>
      <Box
        component="p"
        data-testid="seller"
        sx={{ m: 0, mt: 3, color: color.muted, fontSize: '0.8125rem', lineHeight: 1.6, '& a': { color: 'inherit', '&:hover': { color: color.ink } } }}
      >
        Sold by {seller.name} ({seller.form}), org. nr. {seller.orgNumber}, {seller.address} ·{' '}
        <a href={`mailto:${seller.email}`}>{seller.email}</a> · {seller.vatNote} · <a href={href(links.terms)}>Terms</a> ·{' '}
        <a href={href(links.termsOfSale)}>Terms of sale</a> · <a href={href(links.privacy)}>Privacy</a>
      </Box>
    </Container>
  );
}
