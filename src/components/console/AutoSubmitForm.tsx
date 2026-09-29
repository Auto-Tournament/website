'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Box from '@mui/material/Box';

/**
 * A GET form that submits itself once the page has loaded in a real browser.
 * Mail scanners that only fetch the link never run this script, so they can't
 * use up a single-use token; people land signed in without an extra click.
 * The form's own button stays as the fallback when scripts are off.
 */
export function AutoSubmitForm({ action, children }: { action: string; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // Headless automation (most link scanners that do run scripts) identifies itself here.
    if (navigator.webdriver) return;
    const t = window.setTimeout(() => ref.current?.requestSubmit(), 150);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <Box component="form" ref={ref} method="get" action={action} sx={{ display: 'grid', gap: 2, justifyItems: 'start' }}>
      {children}
    </Box>
  );
}
