'use client';

import { startTransition, useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Status } from '@/components/console/forms';
import type { ActionState } from '@/app/console/actions';
import {
  approvalOptionsAction,
  completePasskeyRegistrationAction,
  passkeyRegistrationOptionsAction,
  requestPasskeyLinkAction,
  signOutEverywhereAction,
  verifySessionAction,
  type PasskeyState,
} from '@/app/console/admin/passkeyActions';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** What the browser said when the passkey prompt failed, in words for the admin. */
function promptError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return 'The passkey prompt was cancelled or timed out. Try again.';
  if (name === 'InvalidStateError') return 'This device already has a passkey for this account.';
  return 'Your browser could not use a passkey here. Try another browser or device.';
}

/** Asks the server for a challenge bound to `action` and `target`, runs the passkey prompt, and returns the assertion as JSON. */
export async function passkeyApproval(action: string, target: string): Promise<{ passkey: string } | { error: string }> {
  const res = await approvalOptionsAction(null, fd({ action, target }));
  if (!res?.options) return { error: res?.error ?? 'Could not start the passkey check.' };
  try {
    const assertion = await startAuthentication({ optionsJSON: res.options as PublicKeyCredentialRequestOptionsJSON });
    return { passkey: JSON.stringify(assertion) };
  } catch (err) {
    return { error: promptError(err) };
  }
}

/**
 * A form whose action needs a fresh passkey approval: on submit it asks the
 * browser for a passkey check bound to `approval` and sends the assertion
 * along as the `passkey` field. The server checks it again.
 */
export function ApprovedForm({
  action,
  approval,
  children,
  submitLabel,
  pendingLabel,
  confirm,
  tone,
  columns = 1,
  testId,
}: {
  action: Action;
  approval: { action: string; target: string };
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  confirm?: string;
  tone?: 'primary' | 'error';
  columns?: 1 | 2;
  testId?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  const [local, setLocal] = useState<ActionState>(null);
  const [asking, setAsking] = useState(false);
  const busy = pending || asking;
  return (
    <Box
      component="form"
      data-testid={testId}
      onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        setLocal(null);
        setAsking(true);
        const got = await passkeyApproval(approval.action, approval.target);
        setAsking(false);
        if ('error' in got) return setLocal({ error: got.error });
        data.set('passkey', got.passkey);
        startTransition(() => run(data));
      }}
      sx={{ display: 'grid', gap: 2, minWidth: 0 }}
    >
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: columns === 2 ? '1fr 1fr' : '1fr' }, '& > *': { minWidth: 0 } }}>{children}</Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Button type="submit" variant={tone === 'error' ? 'outlined' : 'contained'} color={tone ?? 'primary'} disabled={busy}>
          {asking ? 'Waiting for your passkey…' : pending ? (pendingLabel ?? `${submitLabel}…`) : submitLabel}
        </Button>
        <Status state={local ?? state} />
      </Box>
    </Box>
  );
}

function LinkButton({ purpose, label, variant = 'contained' }: { purpose: 'register' | 'recover'; label: string; variant?: 'contained' | 'outlined' | 'text' }) {
  const [state, run, pending] = useActionState(requestPasskeyLinkAction, null);
  return (
    <Box component="form" action={run} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
      <input type="hidden" name="purpose" value={purpose} />
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? 'Sending…' : label}
      </Button>
      <Status state={state} />
    </Box>
  );
}

/** /admin before a passkey exists: that is all there is to do. */
export function PasskeySetup({ waiting }: { waiting: string | null }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, maxWidth: '62ch' }} data-testid="passkey-setup">
      <Typography component="h1" sx={{ fontSize: '1.5rem', fontWeight: 600 }}>
        Set up a passkey
      </Typography>
      <Typography>
        The admin console needs a passkey (Touch ID, Face ID, Windows Hello or a security key) on top of your sign-in. We email you a link to add it, so
        only someone with your email can. Nothing else here works until it is done.
      </Typography>
      {waiting && <Typography>A passkey added through recovery starts to work at {waiting}.</Typography>}
      <LinkButton purpose="register" label="Email me a link to add a passkey" />
    </Box>
  );
}

/** /admin once per session: check the passkey (12 hours), or recover. */
export function PasskeyCheck() {
  const router = useRouter();
  const [state, setState] = useState<PasskeyState>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Box sx={{ display: 'grid', gap: 2, maxWidth: '62ch' }} data-testid="passkey-check">
      <Typography component="h1" sx={{ fontSize: '1.5rem', fontWeight: 600 }}>
        Check your passkey
      </Typography>
      <Typography>Once per session (12 hours), the admin console asks for your passkey.</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Button
          variant="contained"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setState(null);
            const got = await passkeyApproval('admin.session', '');
            if ('error' in got) {
              setBusy(false);
              return setState({ error: got.error });
            }
            const res = await verifySessionAction(null, fd({ passkey: got.passkey }));
            setBusy(false);
            setState(res);
            if (res?.ok) router.refresh();
          }}
        >
          {busy ? 'Waiting for your passkey…' : 'Use my passkey'}
        </Button>
        <Status state={state} />
      </Box>
      <Box sx={{ mt: 3, display: 'grid', gap: 1 }}>
        <Typography sx={{ fontSize: '0.9375rem' }}>
          Lost every passkey? Recover by email: the new passkey starts to work 24 hours after you add it, and we email a warning at once.
        </Typography>
        <LinkButton purpose="recover" label="Recover by email" variant="outlined" />
      </Box>
    </Box>
  );
}

/** The page the passkey email link opens: name it, then the browser creates it. */
export function PasskeyAdd({ token, recovery }: { token: string; recovery: boolean }) {
  const [state, setState] = useState<PasskeyState>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  return (
    <Box
      component="form"
      onSubmit={async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setState(null);
        const res = await passkeyRegistrationOptionsAction(null, fd({ token }));
        if (!res?.options) {
          setBusy(false);
          return setState({ error: res?.error ?? 'Could not start.' });
        }
        let response: string;
        try {
          response = JSON.stringify(await startRegistration({ optionsJSON: res.options as PublicKeyCredentialCreationOptionsJSON }));
        } catch (err) {
          setBusy(false);
          return setState({ error: promptError(err) });
        }
        const done = await completePasskeyRegistrationAction(null, fd({ token, name, response }));
        setBusy(false);
        setState(done);
      }}
      sx={{ display: 'grid', gap: 2, maxWidth: '62ch' }}
    >
      <Typography>
        {recovery
          ? 'Recovery: the passkey you add now starts to work 24 hours from now, and we email you a warning at once.'
          : 'Add a passkey to your admin account. Your device asks for Touch ID, Face ID, your PIN or a security key.'}
      </Typography>
      <TextField label="Name (like “MacBook Touch ID”)" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Button type="submit" variant="contained" disabled={busy || Boolean(state?.ok)}>
          {busy ? 'Waiting for your device…' : 'Create the passkey'}
        </Button>
        <Status state={state} />
      </Box>
    </Box>
  );
}

/** Add another passkey (needs this session checked) — the link goes to your email. */
export function AddPasskeyButton() {
  return <LinkButton purpose="register" label="Email me a link to add a passkey" variant="outlined" />;
}

export function SignOutEverywhere() {
  const [state, run, pending] = useActionState(signOutEverywhereAction, null);
  return (
    <Box
      component="form"
      action={run}
      onSubmit={(e: React.FormEvent) => {
        if (!window.confirm('Sign out of the console on every device, this one too?')) e.preventDefault();
      }}
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}
    >
      <Button type="submit" variant="outlined" color="error" disabled={pending}>
        Sign out everywhere
      </Button>
      <Status state={state} />
    </Box>
  );
}

/** The bookkeeping CSV export: a passkey approval, then a POST that downloads the file. */
export function SalesExport({ from, to, url }: { from: string; to: string; url: string }) {
  const [state, setState] = useState<ActionState>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Box
      component="form"
      aria-label="Export paid sales"
      onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setState(null);
        const got = await passkeyApproval('export.sales', 'sales');
        if ('error' in got) {
          setBusy(false);
          return setState({ error: got.error });
        }
        data.set('passkey', got.passkey);
        const res = await fetch(url, { method: 'POST', body: data, credentials: 'same-origin' }).catch(() => null);
        setBusy(false);
        if (!res || !res.ok) return setState({ error: res ? (await res.text()).slice(0, 300) : 'The export failed. Try again.' });
        const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'sales.csv';
        const href = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        a.click();
        URL.revokeObjectURL(href);
        setState({ ok: 'Downloaded.' });
      }}
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mb: 2 }}
    >
      <TextField type="date" name="from" label="From" defaultValue={from} size="small" slotProps={{ inputLabel: { shrink: true } }} />
      <TextField type="date" name="to" label="To" defaultValue={to} size="small" slotProps={{ inputLabel: { shrink: true } }} />
      <Button type="submit" variant="contained" disabled={busy}>
        {busy ? 'Waiting for your passkey…' : 'Download paid sales (CSV)'}
      </Button>
      <Status state={state} />
    </Box>
  );
}
