import type { NextConfig } from 'next';

const week = 'public, max-age=604800, stale-while-revalidate=86400';

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [
      // Brand assets rarely change; let browsers and Cloudflare keep them a week.
      ...['/at-icon.svg', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png'].map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: week }],
      })),
    ];
  },
};

export default config;
