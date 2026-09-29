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

/** "ATL1.abcd1234…wxyz" style mask: first 8 characters, a fixed run of dots, the last 4. */
function mask(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 8)}••••••••••••${key.slice(-4)}`;
}

/**
 * A license key field, hidden by default. "Show key" reveals the full key
 * (wrapped, selectable); "Copy" always copies the full key regardless of
 * whether it is shown, and reveals it if the copy silently failed.
 */
export function LicenseKeyField({ token, 'data-testid': testId }: { token: string; 'data-testid'?: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    const ok = await copyText(token);
    if (!ok) {
      setRevealed(true);
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box data-testid={testId} sx={{ display: 'grid', gap: 1.25 }}>
      <Box
        component="pre"
        aria-label={revealed ? undefined : 'License key, hidden'}
        sx={{
          ...mono,
          m: 0,
          p: 2,
          borderRadius: `${radius.md}px`,
          bgcolor: color.paper,
          border: `1px solid ${color.rule}`,
          fontSize: '0.8125rem',
          lineHeight: 1.6,
          color: color.ink2,
          whiteSpace: revealed ? 'pre-wrap' : 'nowrap',
          overflow: revealed ? 'visible' : 'hidden',
          textOverflow: revealed ? 'clip' : 'ellipsis',
          overflowWrap: 'anywhere',
          maxWidth: '100%',
          userSelect: revealed ? 'text' : 'none',
        }}
      >
        <code>{revealed ? token : mask(token)}</code>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => setRevealed((r) => !r)} sx={{ bgcolor: color.paper2 }}>
          {revealed ? 'Hide key' : 'Show key'}
        </Button>
        <Button size="small" variant="outlined" onClick={copy} aria-label={copied ? 'License key copied' : 'Copy license key'} data-copied={copied || undefined} sx={{ bgcolor: color.paper2 }}>
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </Box>
      {copyFailed && (
        <Box role="alert" sx={{ color: color.ban, fontSize: '0.875rem' }}>
          Couldn&apos;t copy. Select the key and copy it.
        </Box>
      )}
    </Box>
  );
}
