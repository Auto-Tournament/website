'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { tokens } from '@/theme/tokens';
import { mono } from './ui';

const { color, radius } = tokens;

/** Copy `text`, with a fallback for where the async clipboard API is blocked. True when it worked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The async clipboard API is blocked on plain http and in some embeds;
    // fall back to a hidden textarea and the legacy copy command.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * Monospace code block with a copy button. Copies `code`, not the comment.
 * Long lines wrap inside the block (anywhere, so a long URL never pushes the
 * page wider than the screen).
 */
export function CodeBlock({
  code,
  comment,
  what = 'commands',
  size = 'md',
  'data-testid': testId,
}: {
  code: string;
  comment?: string;
  /** What the button copies, for its accessible name: "Copy badge URL". */
  what?: string;
  size?: 'sm' | 'md';
  'data-testid'?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    if (!(await copyText(code))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  const small = size === 'sm';
  return (
    <Box data-testid={testId} sx={{ position: 'relative', minWidth: 0 }}>
      <Box
        component="pre"
        sx={{
          ...mono,
          m: 0,
          p: small ? 2 : 3,
          pr: { xs: small ? 2 : 3, sm: small ? 10 : 11 },
          borderRadius: `${radius.md}px`,
          bgcolor: color.paper,
          border: `1px solid ${color.rule}`,
          fontSize: small ? '0.8125rem' : '0.875rem',
          lineHeight: small ? 1.6 : 1.7,
          color: color.ink2,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          maxWidth: '100%',
        }}
      >
        {comment && (
          <Box component="span" sx={{ color: color.muted, display: 'block' }}>
            {comment}
          </Box>
        )}
        <code>{code}</code>
      </Box>
      <Button
        size="small"
        variant="outlined"
        onClick={copy}
        aria-label={copied ? `${what[0].toUpperCase()}${what.slice(1)} copied` : `Copy ${what}`}
        data-copied={copied || undefined}
        sx={{
          position: { xs: 'static', sm: 'absolute' },
          top: small ? 8 : 12,
          right: small ? 8 : 12,
          mt: { xs: 1, sm: 0 },
          minWidth: 76,
          bgcolor: color.paper2,
        }}
      >
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </Button>
    </Box>
  );
}
