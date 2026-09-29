'use client';

import { useActionState } from 'react';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { tokens } from '@/theme/tokens';
import { NavMenu } from '@/components/nav/NavMenu';
import type { ActionState } from '@/app/console/actions';

const { color } = tokens;

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** The result line under a form: role=status for success, role=alert for errors. */
export function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error)
    return (
      <Typography role="alert" sx={{ color: color.ban, fontSize: '0.9375rem' }}>
        {state.error}
      </Typography>
    );
  if (state.ok)
    return (
      <Typography role="status" sx={{ color: color.live, fontSize: '0.9375rem' }}>
        {state.ok}
      </Typography>
    );
  return null;
}

/**
 * A one-button form for a console action, with hidden fields. Shows the
 * result next to it. `confirm` asks first (the browser's own dialog).
 */
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  variant = 'outlined',
  color: tone,
  confirm,
  size = 'small',
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: 'outlined' | 'contained' | 'text';
  color?: 'primary' | 'error' | 'inherit';
  confirm?: string;
  size?: 'small' | 'medium';
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <Box
      component="form"
      action={run}
      onSubmit={(e: React.FormEvent) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, minWidth: 0 }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} color={tone} size={size} disabled={pending}>
        {pending ? (pendingLabel ?? label) : label}
      </Button>
      <Status state={state} />
    </Box>
  );
}

/** Email-link sign-in. */
export function EmailSignInForm({ action }: { action: Action }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <Box component="form" action={run} sx={{ display: 'grid', gap: 2, maxWidth: 440 }}>
      <TextField name="email" label="Email" type="email" required autoComplete="email" slotProps={{ htmlInput: { maxLength: 254 } }} />
      <Box>
        <Button type="submit" variant="contained" disabled={pending}>
          {pending ? 'Sending…' : 'Email me a sign-in link'}
        </Button>
      </Box>
      <Status state={state} />
    </Box>
  );
}

/** "Continue with Google". */
export function GoogleSignInButton({ action }: { action: Action }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <Box component="form" action={run} sx={{ display: 'grid', gap: 1.5, maxWidth: 440 }}>
      <Box>
        <Button type="submit" variant="outlined" disabled={pending}>
          {pending ? 'Opening Google…' : 'Continue with Google'}
        </Button>
      </Box>
      <Status state={state} />
    </Box>
  );
}

export type OrgValues = {
  name: string;
  orgNumber: string;
  vatId: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
};

/** Create or edit an organization. */
export function OrgForm({
  action,
  countries,
  values,
  orgId,
  submitLabel,
  readOnly = false,
}: {
  action: Action;
  countries: [string, string][];
  values?: Partial<OrgValues>;
  orgId?: string;
  submitLabel: string;
  readOnly?: boolean;
}) {
  const [state, run, pending] = useActionState(action, null);
  const errors = state?.fieldErrors ?? {};
  const field = (name: keyof OrgValues, label: string, props: { required?: boolean; autoComplete?: string; max?: number; wide?: boolean } = {}) => (
    <TextField
      name={name}
      label={label}
      defaultValue={values?.[name] ?? ''}
      required={props.required}
      autoComplete={props.autoComplete}
      error={Boolean(errors[name])}
      helperText={errors[name]}
      disabled={readOnly}
      slotProps={{ htmlInput: { maxLength: props.max ?? 200 } }}
      sx={{ gridColumn: props.wide ? '1 / -1' : undefined, minWidth: 0 }}
    />
  );
  return (
    <Box component="form" action={run} sx={{ display: 'grid', gap: 2 }}>
      {orgId && <input type="hidden" name="orgId" value={orgId} />}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        {field('name', 'Organization name', { required: true, autoComplete: 'organization', max: 120, wide: true })}
        {field('orgNumber', 'Organization number', { max: 40 })}
        {field('vatId', 'VAT ID', { max: 40 })}
        <TextField
          select
          name="country"
          label="Country"
          defaultValue={values?.country ?? ''}
          error={Boolean(errors.country)}
          helperText={errors.country}
          disabled={readOnly}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          sx={{ gridColumn: '1 / -1', minWidth: 0 }}
        >
          <option value="">Not set</option>
          {countries.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </TextField>
        {field('addressLine1', 'Billing address', { autoComplete: 'address-line1', wide: true })}
        {field('addressLine2', 'Address line 2', { autoComplete: 'address-line2', wide: true })}
        {field('postalCode', 'Postal code', { autoComplete: 'postal-code', max: 20 })}
        {field('city', 'City', { autoComplete: 'address-level2', max: 100 })}
      </Box>
      {!readOnly && (
        <Box>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </Box>
      )}
      <Status state={state} />
    </Box>
  );
}

/** Invite someone by email. */
export function InviteForm({ action, orgId, canInviteOwner }: { action: Action; orgId: string; canInviteOwner: boolean }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <Box
      component="form"
      action={run}
      sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 10rem auto' }, alignItems: 'start' }}
    >
      <input type="hidden" name="orgId" value={orgId} />
      <TextField name="email" label="Email" type="email" required autoComplete="off" slotProps={{ htmlInput: { maxLength: 254 } }} sx={{ minWidth: 0 }} />
      <TextField select name="role" label="Role" defaultValue="member" slotProps={{ select: { native: true } }} sx={{ minWidth: 0 }}>
        <option value="member">Member</option>
        <option value="admin">Admin</option>
        {canInviteOwner && <option value="owner">Owner</option>}
      </TextField>
      <Button type="submit" variant="contained" disabled={pending} sx={{ height: 56 }}>
        {pending ? 'Sending…' : 'Invite'}
      </Button>
      <Box sx={{ gridColumn: '1 / -1' }}>
        <Status state={state} />
      </Box>
    </Box>
  );
}

/** A member's role, changeable in place. */
export function RoleForm({ action, orgId, userId, role, allowOwner }: { action: Action; orgId: string; userId: string; role: string; allowOwner: boolean }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <Box component="form" action={run} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="userId" value={userId} />
      <TextField
        select
        name="role"
        size="small"
        defaultValue={role}
        aria-label="Role"
        slotProps={{ select: { native: true } }}
        onChange={(e) => (e.target as HTMLElement).closest('form')?.requestSubmit()}
        disabled={pending}
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
        {(allowOwner || role === 'owner') && <option value="owner">Owner</option>}
      </TextField>
      <noscript>
        <Button type="submit" size="small">
          Save
        </Button>
      </noscript>
      <Status state={state} />
    </Box>
  );
}

/**
 * The organization switcher, as a menu: "<Org name> ▾" with the other
 * organizations underneath. Each one is its own one-click form, like the
 * account menu's sign-out button; picking one switches and the server
 * redirects back to the same console section.
 */
export function OrgSwitcherMenu({ action, orgs, current, hydrated }: { action: Action; orgs: { id: string; name: string }[]; current: string; hydrated: boolean }) {
  const { color, radius } = tokens;
  // Stay on the same section after switching.
  const next = `/${(usePathname() ?? '').split('/').filter(Boolean).at(-1) ?? 'licenses'}`;
  const currentOrg = orgs.find((o) => o.id === current) ?? orgs[0];
  return (
    <NavMenu
      id="org-switcher"
      hydrated={hydrated}
      fallbackHref="/licenses"
      ariaLabel="Organization"
      panelLabel="Organizations"
      align="right"
      width="14rem"
      trigger={
        <>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { xs: '6rem', sm: '10rem' } }}>
            {currentOrg?.name ?? 'Organization'}
          </Box>
          <CaretDown className="nav-menu-caret" size={12} weight="bold" aria-hidden style={{ flex: 'none' }} />
        </>
      }
    >
      {orgs.map((o) => (
        <Box
          key={o.id}
          component="form"
          action={async (fd: FormData) => {
            await action(null, fd);
          }}
          sx={{ m: 0 }}
        >
          <input type="hidden" name="orgId" value={o.id} />
          <input type="hidden" name="next" value={next} />
          <Box
            component="button"
            type="submit"
            aria-current={o.id === current ? 'true' : undefined}
            sx={{
              display: 'block',
              width: '100%',
              px: 1.25,
              py: 1,
              border: 0,
              borderRadius: `${radius.md}px`,
              bgcolor: o.id === current ? color.paper3 : 'transparent',
              color: color.ink,
              font: 'inherit',
              fontWeight: o.id === current ? 600 : 400,
              fontSize: '0.9375rem',
              textAlign: 'left',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: 'pointer',
              '&:hover, &:focus-visible': { bgcolor: color.paper3 },
            }}
          >
            {o.name}
          </Box>
        </Box>
      ))}
    </NavMenu>
  );
}
