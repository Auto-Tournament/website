import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://autotournament.gg/', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://autotournament.gg/pricing', changeFrequency: 'monthly', priority: 0.8 },
  ];
}
