import type { MetadataRoute } from 'next';
import { productPaths } from '@/content/catalog';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://autotournament.gg/', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://autotournament.gg/pricing', changeFrequency: 'monthly', priority: 0.8 },
    ...productPaths().map((path) => ({ url: `https://autotournament.gg${path}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: 'https://autotournament.gg/compatibility', changeFrequency: 'daily', priority: 0.6 },
    { url: 'https://autotournament.gg/contact', changeFrequency: 'yearly', priority: 0.4 },
    { url: 'https://autotournament.gg/terms', changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://autotournament.gg/terms-of-sale', changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://autotournament.gg/privacy', changeFrequency: 'yearly', priority: 0.3 },
  ];
}
