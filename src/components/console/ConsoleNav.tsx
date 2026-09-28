'use client';

import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';

const { color, radius } = tokens;

/** The organization's sections. Wraps on narrow screens instead of scrolling sideways. */
export function ConsoleTabs({ base }: { base: string }) {
  const pathname = usePathname() ?? '';
  const tabs: [string, string][] = [
    ['Licenses', '/licenses'],
    ['Members', '/members'],
    ['Billing', '/billing'],
    ['Buy', '/buy'],
  ];
  return (
    <Box component="nav" aria-label="Console" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {tabs.map(([label, path]) => {
        const href = `${base}${path}`;
        // The proxy rewrites console.autotournament.gg/x to /console/x: match either.
        const active = pathname.endsWith(path);
        return (
          <Box
            key={path}
            component="a"
            href={href}
            aria-current={active ? 'page' : undefined}
            sx={{
              px: 1.75,
              py: 0.75,
              borderRadius: `${radius.pill}px`,
              border: `1px solid ${active ? color.accent : color.rule}`,
              color: active ? color.ink : color.ink2,
              bgcolor: active ? color.paper3 : 'transparent',
              textDecoration: 'none',
              fontSize: '0.9375rem',
              whiteSpace: 'nowrap',
              '&:hover': { color: color.ink, borderColor: color.accent },
            }}
          >
            {label}
          </Box>
        );
      })}
    </Box>
  );
}
