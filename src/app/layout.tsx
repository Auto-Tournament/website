import type { Metadata } from 'next';
import { Geist, Geist_Mono, Sora } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '@/theme/theme';

const display = Sora({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display' });
const body = Geist({ subsets: ['latin'], variable: '--font-body' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  metadataBase: new URL('https://autotournament.gg'),
  title: 'Auto Tournament: self-hosted tournaments that run themselves',
  description:
    'Auto Tournament builds the bracket, runs the map veto, puts every match on a free server and records the result. Self-hosted and open source, with CS2 built in.',
  icons: { icon: '/at-icon.svg', apple: '/apple-touch-icon.png' },
  openGraph: { title: 'Auto Tournament', description: 'Self-hosted tournaments that run themselves. CS2 built in.' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
