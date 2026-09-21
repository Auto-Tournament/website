import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://autotournament.gg/', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://docs.autotournament.gg/', changeFrequency: 'weekly', priority: 0.8 },
    { url: 'https://docs.autotournament.gg/getting-started/install', changeFrequency: 'monthly', priority: 0.8 },
  ];
}
