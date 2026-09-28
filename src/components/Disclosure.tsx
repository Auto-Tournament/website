'use client';

import { useEffect, useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';

const { color, ease, duration } = tokens;

/**
 * One collapsible section of the pricing page's fine print and FAQ. The
 * summary is a button inside an h3 (MUI's heading slot), so headings stay in
 * order and it works with Tab, Enter and Space. It opens by itself when the
 * URL points at it (#founder-terms, #rules…), so old links still land on
 * the right text.
 */
export function Disclosure({ id, title, children }: { id: string; title: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fromHash = () => {
      if (window.location.hash !== `#${id}`) return;
      setOpen(true);
      // Let it open first, then bring the heading into view.
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [id]);

  return (
    <Accordion
      id={id}
      expanded={open}
      onChange={(_e, next) => setOpen(next)}
      disableGutters
      square
      elevation={0}
      slotProps={{ region: { id: `${id}-content`, 'aria-labelledby': `${id}-summary` } }}
      sx={{
        bgcolor: 'transparent',
        backgroundImage: 'none',
        color: 'inherit',
        borderTop: `1px solid ${color.rule}`,
        '&:last-of-type': { borderBottom: `1px solid ${color.rule}` },
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary
        aria-controls={`${id}-content`}
        id={`${id}-summary`}
        expandIcon={
          <Box
            component="span"
            aria-hidden
            sx={{ width: 10, height: 10, mt: '-4px', borderRight: `2px solid ${color.ink2}`, borderBottom: `2px solid ${color.ink2}`, transform: 'rotate(45deg)' }}
          />
        }
        sx={{
          px: 0,
          py: 1,
          minHeight: 56,
          '& .MuiAccordionSummary-content': { my: 1, mr: 2 },
          '& .MuiAccordionSummary-expandIconWrapper': { mr: 1, transition: `transform ${duration.fast}ms ${ease.out}` },
          '&.Mui-focusVisible': { bgcolor: 'transparent', outline: `2px solid ${color.focus}`, outlineOffset: 2 },
          '&:hover .disclosure-title': { color: color.accent },
          '@media (prefers-reduced-motion: reduce)': { '& .MuiAccordionSummary-expandIconWrapper': { transition: 'none' } },
        }}
      >
        <Box component="span" className="disclosure-title" sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: { xs: '1.0625rem', md: '1.125rem' }, lineHeight: 1.3, color: color.ink }}>
          {title}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0, pb: 3, color: color.ink2 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
