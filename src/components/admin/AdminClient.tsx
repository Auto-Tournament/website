'use client';

import { useActionState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { Status } from '@/components/console/forms';
import type { ActionState } from '@/app/console/actions';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

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
