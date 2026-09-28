'use client';

import { useActionState } from 'react';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { tokens } from '@/theme/tokens';
import { Status } from '@/components/console/forms';
import type { ActionState } from '@/app/console/actions';

const { color, radius } = tokens;

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const sections: [string, string][] = [
  ['Overview', '/admin'],
  ['Licenses', '/admin/licenses'],
  ['New license', '/admin/licenses/new'],
  ['Organizations', '/admin/orgs'],
  ['Users', '/admin/users'],
  ['Leads', '/admin/leads'],
  ['Free LANs', '/admin/free-lans'],
  ['Audit log', '/admin/audit'],
];

/** The admin sections. Wraps on narrow screens instead of scrolling sideways. */
export function AdminNav({ base }: { base: string }) {
  // The proxy rewrites console.autotournament.gg/x to /console/x: compare without the prefix.
  const path = (usePathname() ?? '').replace(/^\/console(?=\/)/, '');
  const active = sections
    .map(([, p]) => p)
    .filter((p) => path === p || (p !== '/admin' && path.startsWith(`${p}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <Box component="nav" aria-label="Admin" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {sections.map(([label, p]) => {
        const on = p === active;
        return (
          <Box
            key={p}
            component="a"
            href={`${base}${p}`}
            aria-current={on ? 'page' : undefined}
            sx={{
              px: 1.5,
              py: 0.6,
              borderRadius: `${radius.pill}px`,
              border: `1px solid ${on ? color.accent : color.rule}`,
              color: on ? color.ink : color.ink2,
              bgcolor: on ? color.paper3 : 'transparent',
              textDecoration: 'none',
              fontSize: '0.875rem',
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

/**
 * A form for an admin action: the fields (server-rendered children), a submit
 * button and the result line. `confirm` asks first (the browser's own dialog).
 */
export function AdminForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  confirm,
  tone,
  columns = 1,
  testId,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  confirm?: string;
  tone?: 'primary' | 'error';
  columns?: 1 | 2;
  testId?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <Box
      component="form"
      action={run}
      data-testid={testId}
      onSubmit={(e: React.FormEvent) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      sx={{ display: 'grid', gap: 2, minWidth: 0 }}
    >
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: columns === 2 ? '1fr 1fr' : '1fr' }, '& > *': { minWidth: 0 } }}>{children}</Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Button type="submit" variant={tone === 'error' ? 'outlined' : 'contained'} color={tone ?? 'primary'} disabled={pending}>
          {pending ? (pendingLabel ?? `${submitLabel}…`) : submitLabel}
        </Button>
        <Status state={state} />
      </Box>
    </Box>
  );
}
