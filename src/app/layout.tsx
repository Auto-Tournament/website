import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Sora } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '@/theme/theme';
import { hex } from '@/theme/tokens';
import { ThemeLab } from '@/components/ThemeLab';

// `optional` keeps the hero text from repainting when the fonts arrive late on slow
// connections (that repaint was the mobile LCP). The metric-matched fallback
// is close enough for a first visit; later visits have Sora cached.
const display = Sora({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display', display: 'optional' });
const body = Geist({ subsets: ['latin'], variable: '--font-body', display: 'optional' });
// Only used in the product cards below the fold, so don't preload it.
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', preload: false });

const url = 'https://autotournament.gg';
const title = 'Auto Tournament: the tournament runs, you play';
const description =
  'Ditch the spreadsheet. Auto Tournament is a free, self-hosted tournament platform: it builds the bracket, runs the map veto, puts every match on a free server and records the results. Open source, with CS2 built in.';

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: title, template: '%s · Auto Tournament' },
  description,
  applicationName: 'Auto Tournament',
  keywords: ['tournament software', 'CS2 tournament', 'self-hosted tournament platform', 'bracket generator', 'map veto', 'LAN party', 'esports', 'MatchZy'],
  authors: [{ name: 'Auto Tournament', url }],
  creator: 'Auto Tournament',
  alternates: { canonical: '/' },
  icons: { icon: '/at-icon.svg', apple: '/apple-touch-icon.png' },
  openGraph: {
    type: 'website',
    url,
    siteName: 'Auto Tournament',
    title,
    description: 'Free, self-hosted tournament platform. Brackets, map veto, servers and results run themselves. CS2 built in.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description: 'Free, self-hosted tournament platform. Brackets, map veto, servers and results run themselves. CS2 built in.',
  },
  robots: { index: true, follow: true },
  category: 'technology',
};

export const viewport: Viewport = {
  themeColor: hex.paper,
  colorScheme: 'dark',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${url}/#org`,
      name: 'Auto Tournament',
      url,
      logo: `${url}/apple-touch-icon.png`,
      sameAs: ['https://github.com/Auto-Tournament', 'https://discord.gg/n7gHYau7aW'],
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Auto Tournament',
      url,
      description,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Linux, macOS, Windows (Docker)',
      softwareHelp: 'https://docs.autotournament.gg',
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${url}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
            <ThemeLab />
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
