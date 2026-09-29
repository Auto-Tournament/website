import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /console lives on its own host and carries its own noindex meta; /dev and /api aren't
      // pages; /pricing/thanks and /verify/<id> are per-visit receipts, not content to index.
      disallow: ['/dev', '/dev/*', '/api', '/api/*', '/pricing/thanks', '/verify/*'],
    },
    sitemap: 'https://autotournament.gg/sitemap.xml',
    host: 'https://autotournament.gg',
  };
}
