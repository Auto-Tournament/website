import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import TextField from '@mui/material/TextField';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { DetailList } from '@/components/LicenseKeyView';
import { AdminForm } from '@/components/admin/AdminClient';
import { ApprovedForm } from '@/components/admin/Passkeys';
import { Badge } from '@/components/admin/AdminUi';
import { dayTime, money } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { getOrder } from '@/lib/admin/licenses';
import { formatDay, kindNames, packName } from '@/lib/license/describe';
import { consoleHref } from '@/lib/console/urls';
import { cancelOrderAction, markPaidAction } from '../../actions';

export const metadata: Metadata = { title: 'Manual order' };
export const dynamic = 'force-dynamic';

export default async function ManualOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const order = await getOrder(db(), (await params).id);
  if (!order) notFound();
  const tone = order.status === 'paid' ? 'good' : order.status === 'unpaid' ? 'warn' : 'muted';
  const dates =
    order.kind === 'event' && order.startDay && order.endDay
      ? `${formatDay(order.startDay)} – ${formatDay(order.endDay)}`
      : order.kind === 'year'
        ? `Updates from ${order.startDay ? formatDay(order.startDay) : 'the day it is paid'}${order.endDay ? ` until ${formatDay(order.endDay)}` : ', 12 months'}`
        : 'For life';

  return (
    <>
      <PageTitle sub={`Manual order ${order.id.slice(0, 8)}, created ${dayTime(order.createdAt)}.`}>{order.licensee}</PageTitle>
      <DetailList
        rows={[
          ['Status', <Badge key="s" tone={tone}>{order.status === 'paid' ? 'Paid' : order.status === 'unpaid' ? 'Unpaid' : 'Cancelled'}</Badge>],
          ['Pack', `${packName({ product: order.product as 'servers', pack: order.pack as 'S' })}, up to ${order.maxServers} servers`],
          ['Kind', kindNames[order.kind as 'event']],
          ['Dates', dates],
          ['Organization', order.orgId ? <a key="o" href={consoleHref(`/admin/orgs/${order.orgId}`)}>{order.orgName}</a> : 'None'],
          ['Buyer email', order.emailHash ? 'On file (hashed)' : 'None'],
          ['Amount', money(order.amountTotal, order.currency)],
          ['Payment reference', order.paymentRef ?? '—'],
          ['Paid', order.paidAt ? dayTime(order.paidAt) : '—'],
          ['License', order.licenseId ? <a key="l" href={consoleHref(`/admin/licenses/${order.licenseId}`)}>{order.licenseId}</a> : 'Not issued yet'],
        ]}
      />
      {order.status === 'unpaid' && (
        <>
          <Panel title="Mark paid">
            <ApprovedForm action={markPaidAction} approval={{ action: 'order.paid', target: order.id }} submitLabel="Mark paid and issue the key" pendingLabel="Issuing…" columns={2} testId="mark-paid-form">
              <input type="hidden" name="orderId" value={order.id} />
              <TextField name="paidOn" label="Paid on" type="date" helperText="Empty: today." slotProps={{ inputLabel: { shrink: true } }} />
              <TextField name="paymentRef" label="Payment reference" defaultValue={order.paymentRef ?? ''} slotProps={{ htmlInput: { maxLength: 200 } }} />
              <TextField
                name="email"
                label="Email the key to (optional)"
                type="email"
                autoComplete="off"
                helperText="Only the buyer email given with the order works."
                slotProps={{ htmlInput: { maxLength: 254 } }}
                sx={{ gridColumn: '1 / -1' }}
              />
            </ApprovedForm>
          </Panel>
          <Panel title="Cancel">
            <AdminForm action={cancelOrderAction} submitLabel="Cancel the order" tone="error" confirm="Cancel this order? A founder place it held is freed.">
              <input type="hidden" name="orderId" value={order.id} />
            </AdminForm>
          </Panel>
        </>
      )}
    </>
  );
}
