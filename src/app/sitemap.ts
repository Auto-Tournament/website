import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://autotournament.gg/', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://autotournament.gg/pricing', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://autotournament.gg/terms', changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://autotournament.gg/terms-of-sale', changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://autotournament.gg/privacy', changeFrequency: 'yearly', priority: 0.3 },
  ];
}
