'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { links } from '@/components/links';
import type { CompatStatus } from '@/lib/compat/document';
import { CompatDot, compatSummaryTone } from './CompatDot';
import { compatSummaryText } from './labels';

const { color } = tokens;

const unknown: CompatStatus = { overall: null, cs2: null, checked_at: null };

/**
 * The nav's CS2 compatibility dot, linking to /compatibility. Grey until
 * `GET /api/compat/status` answers (the page never waits on it), and grey for
 * good when that read fails. The word "CS2" shows from the sm breakpoint up;
 * on phones the dot stands alone, named by its aria-label.
 */
export function CompatNavStatus() {
  const [status, setStatus] = useState<CompatStatus>(unknown);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/compat/status', { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ status?: CompatStatus }>) : null))
      .then((body) => {
        if (body?.status) setStatus(body.status);
      })
      .catch(() => {
        // Offline, rate limited or aborted: stay grey (unknown).
      });
    return () => controller.abort();
  }, []);

  const tone = compatSummaryTone(status.overall);
  const { label, title } = compatSummaryText(status);
  return (
    <Box
      component="a"
      href={links.compatibility}
      aria-label={label}
      title={title}
      data-testid="nav-compat"
      data-tone={tone}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.75,
        minWidth: 32,
        minHeight: 32,
        px: { xs: 0.5, sm: 0 },
        color: color.ink2,
        textDecoration: 'none',
        fontSize: '0.875rem',
        whiteSpace: 'nowrap',
        borderRadius: '999px',
        '&:hover': { color: color.ink },
      }}
    >
      <CompatDot tone={tone} size={8} />
      <Box component="span" aria-hidden sx={{ display: { xs: 'none', sm: 'inline' } }}>
        CS2
      </Box>
    </Box>
  );
}
