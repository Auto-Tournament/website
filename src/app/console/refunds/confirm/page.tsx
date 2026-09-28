import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { PageTitle } from '@/components/console/ConsoleShell';
import { DetailList } from '@/components/LicenseKeyView';
import { AdminForm } from '@/components/admin/AdminClient';
import { dayTime } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { isAdminUser } from '@/lib/admin/access';
import { licenseById } from '@/lib/admin/licenses';
import { consoleEnabled } from '@/lib/console/auth';
import { moneyText, REFUND_REASON_TEXT } from '@/lib/console/emails';
import { currentUser } from '@/lib/console/session';
import { consoleHref } from '@/lib/console/urls';
import { packName } from '@/lib/license/describe';
import { effectiveStatus, REFUND_TOKEN, requestByToken } from '@/lib/license/refundRequests';
import { confirmRefundAction } from '../../admin/actions';
import { cancelRefundByLinkAction } from '../actions';

const { color } = tokens;

// Where the refund confirmation link (emailed to the admin who asked) lands.
// Opening it changes nothing (mail scanners open links): the buttons POST.
// Confirm needs the signed-in admin who asked; Cancel needs only the link.
export const metadata: Metadata = {
  title: 'Confirm refund',
  // The URL carries the token: send nothing onwards.
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const done: Record<string, string> = {
  confirming: 'This refund is being made right now. Check the license page in a moment.',
  confirmed: 'This refund was already confirmed.',
  cancelled: 'This refund request was cancelled. Nothing was refunded.',
  expired: 'This link has expired. Nothing was refunded; ask for the refund again on the license page.',
};

function CancelForms({ token, emphasis }: { token: string; emphasis: boolean }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, mt: emphasis ? 0 : 4, pt: emphasis ? 0 : 3, borderTop: emphasis ? 'none' : `1px solid ${color.rule}` }}>
      <Typography sx={{ fontSize: '0.9375rem', maxWidth: '62ch' }}>
        Didn&apos;t ask for this? Cancel it and sign out of the console everywhere (every browser, including whoever asked), then tell the other admins.
      </Typography>
      <AdminForm action={cancelRefundByLinkAction} submitLabel="Cancel and sign out everywhere" pendingLabel="Cancelling…" tone="error" testId="cancel-signout">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="signOut" value="yes" />
      </AdminForm>
      <AdminForm action={cancelRefundByLinkAction} submitLabel="Just cancel the refund" pendingLabel="Cancelling…" testId="cancel-only">
        <input type="hidden" name="token" value={token} />
      </AdminForm>
    </Box>
  );
}

export default async function ConfirmRefund({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = typeof params.token === 'string' && REFUND_TOKEN.test(params.token) ? params.token : null;
  const cancelMode = params.cancel === '1';
  const request = token && consoleEnabled() ? await requestByToken(db(), token).catch(() => null) : null;

  if (!token || !request) {
    return (
      <>
        <PageTitle>Confirm refund</PageTitle>
        <Typography>This link isn&apos;t valid. Nothing was refunded.</Typography>
      </>
    );
  }

  const status = effectiveStatus(request);
  if (status !== 'pending') {
    return (
      <>
        <PageTitle>Confirm refund</PageTitle>
        <Typography>{done[status]}</Typography>
        <Box sx={{ mt: 4, display: 'grid', gap: 2 }}>
          <Typography sx={{ fontSize: '0.9375rem', maxWidth: '62ch' }}>Didn&apos;t ask for this refund? Sign out of the console everywhere and tell the other admins.</Typography>
          <AdminForm action={cancelRefundByLinkAction} submitLabel="Sign out everywhere" pendingLabel="Signing out…" tone="error" testId="signout-only">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="signOut" value="yes" />
          </AdminForm>
        </Box>
      </>
    );
  }

  const user = await currentUser();
  const isAsker = Boolean(user && isAdminUser(user) && user.id === request.adminUserId);

  if (cancelMode) {
    return (
      <>
        <PageTitle>Cancel refund</PageTitle>
        <Typography sx={{ mb: 3 }}>
          A refund of {moneyText(request.amount, request.currency)} for license {request.licenseId} is waiting for confirmation.
        </Typography>
        <CancelForms token={token} emphasis />
      </>
    );
  }

  if (!isAsker) {
    return (
      <>
        <PageTitle>Confirm refund</PageTitle>
        <Typography sx={{ maxWidth: '62ch' }}>
          {user
            ? 'You are signed in as someone else. Only the admin who asked for this refund can confirm it: sign out, sign in as them, and open the link again.'
            : 'Sign in to the console as the admin who asked for this refund, then open the link in the email again.'}{' '}
          {!user && <a href={consoleHref('/signin')}>Sign in</a>}
        </Typography>
        <CancelForms token={token} emphasis={false} />
      </>
    );
  }

  const record = await licenseById(db(), request.licenseId).catch(() => null);
  const rows: [string, React.ReactNode][] = [
    ['License', <a key="l" href={consoleHref(`/admin/licenses/${request.licenseId}`)}>{request.licenseId}</a>],
    ['Licensee', record?.payload.licensee ?? 'Not given'],
    ['Pack', record ? packName(record.payload) : 'Unknown'],
    ['Amount', moneyText(request.amount, request.currency)],
    ['Reason', REFUND_REASON_TEXT[request.reason] ?? request.reason],
    ...(request.note ? ([['Note', request.note]] as [string, string][]) : []),
    ['Email the buyer', request.notifyBuyer ? 'Yes' : 'No'],
    ['Asked at', dayTime(request.createdAt)],
    ['Link expires', dayTime(request.expiresAt)],
  ];

  return (
    <>
      <PageTitle sub="Check the details. Confirm makes the refund: through Stripe for a card payment, or records it for a bank transfer. It can't be undone.">Confirm refund</PageTitle>
      <DetailList rows={rows} />
      <Box sx={{ mt: 3 }}>
        <AdminForm action={confirmRefundAction} submitLabel={`Confirm the refund of ${moneyText(request.amount, request.currency)}`} pendingLabel="Refunding…" tone="error" testId="confirm-refund">
          <input type="hidden" name="token" value={token} />
        </AdminForm>
      </Box>
      <CancelForms token={token} emphasis={false} />
    </>
  );
}
