/* The console's own footer: one line, the legal seller line the main site's
 * footer also carries, with Privacy / Terms / Contact pointing back at the
 * main site. No shader, no site nav links, no theme picker — the console page
 * ends here. `site` is the main site's origin on the console's own host
 * ('' in development, where the console is /console on the same host). */

import Container from '@mui/material/Container';
import { tokens } from '@/theme/tokens';
import { links } from '../links';
import { siteHref } from '../nav/navItems';
import { seller } from '../seller';

const { color } = tokens;

export function ConsoleFooter({ site = '' }: { site?: string } = {}) {
  const href = (path: string) => siteHref(path, site);
  return (
    <Container maxWidth="md" component="footer" sx={{ pt: 6, pb: 6, mt: 4, borderTop: `1px solid ${color.rule}` }}>
      <p style={{ margin: 0, color: color.muted, fontSize: '0.8125rem', lineHeight: 1.6 }}>
        Sold by {seller.name} ({seller.form}), org. nr. {seller.orgNumber} ·{' '}
        <a href={href(links.privacy)} style={{ color: 'inherit' }}>
          Privacy
        </a>{' '}
        ·{' '}
        <a href={href(links.terms)} style={{ color: 'inherit' }}>
          Terms
        </a>{' '}
        ·{' '}
        <a href={href(links.contact)} style={{ color: 'inherit' }}>
          Contact
        </a>
      </p>
    </Container>
  );
}
