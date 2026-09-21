import type { MetadataRoute } from 'next';
import { tokens } from '@/theme/tokens';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Auto Tournament',
    short_name: 'Auto Tournament',
    description: 'Self-hosted tournament platform. The tournament runs, you play.',
    start_url: '/',
    display: 'browser',
    background_color: tokens.color.paper,
    theme_color: tokens.color.paper,
    icons: [
      { src: '/at-icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
  };
}
