import type { NextConfig } from 'next';

const week = 'public, max-age=604800, stale-while-revalidate=86400';

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  // Dev only: lets another machine on the LAN open the dev server (DEV_ORIGINS=192.168.x.y).
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(',').filter(Boolean) ?? [],
  // The console's forms (Server Actions) are small: cap their bodies.
  experimental: { serverActions: { bodySizeLimit: '32kb' } },
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
