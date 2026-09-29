import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { tokens } from '@/theme/tokens';
import { PageTitle, Panel } from '@/components/console/ConsoleShell';
import { CodeBlock } from '@/components/CodeBlock';
import { DetailList, PublicCheckLink } from '@/components/LicenseKeyView';
import { AdminForm } from '@/components/admin/AdminClient';
import { ApprovedForm } from '@/components/admin/Passkeys';
import { Badge, DataTable, Muted } from '@/components/admin/AdminUi';
import { TermsFields } from '@/components/admin/TermsFields';
import { RefundForm } from '@/components/admin/RefundForm';
import { day, dayTime, money, statusTone, stripeInvoiceSearch, stripeLinks } from '@/components/admin/format';
import { db } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminStatusLabel, licenseDetail } from '@/lib/admin/licenses';
import { refundable } from '@/lib/license/refund';
import { pendingRequests, REFUNDS_NEED_EMAIL } from '@/lib/license/refundRequests';
import { emailConfig } from '@/lib/email/postmark';
import { moneyText } from '@/lib/console/emails';
import { kindNames, licenseDurationText, packName, todayUtc } from '@/lib/license/describe';
import { LICENSE_ID } from '@/lib/license/verify';
import { consoleHref } from '@/lib/console/urls';
import { siteUrl } from '@/lib/site';
import { addLicenseNoteAction, cancelRefundRequestAction, reissueAction, requestRefundAction, resendAction, revokeAction } from '../../actions';

const { color } = tokens;

export const metadata: Metadata = { title: 'License' };
export const dynamic = 'force-dynamic';

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  );
}

export default async function AdminLicense({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = decodeURIComponent((await params).id).slice(0, 80);
  if (!LICENSE_ID.test(id)) notFound();
  const today = todayUtc();
  const detail = await licenseDetail(db(), id, today);
  if (!detail) notFound();
  const { record: r, status, org } = detail;
  const payment = await refundable(db(), id);
  const pending = await pendingRequests(db(), id);
  const canEmail = emailConfig() !== null;
  const p = r.payload;
  const href = (path: string) => consoleHref(path);
  const site = siteUrl() ?? '';
  const customer = /^cus_/.test(p.customer) ? p.customer : (org?.stripeCustomerId ?? null);
  const stripe = r.source === 'manual' ? [] : stripeLinks({ sessionId: r.session_id, customer, livemode: r.livemode, paymentIntent: payment?.root.payment_intent ?? null });
  const refunded = payment && payment.refunded > 0 ? payment : null;
  const current = !r.superseded_by && !r.revoked_at;

  const emailStatus = !r.email_sha256
    ? 'No buyer email on file'
    : r.emailed_at
      ? `Emailed ${dayTime(new Date(r.emailed_at))}${r.email_error ? ` (a later send failed: ${r.email_error})` : ''}`
      : r.email_error
        ? `Not emailed: ${r.email_error}`
        : 'Not emailed yet';

  const rows: [string, React.ReactNode][] = [
    ['Status', <Badge key="s" tone={statusTone[status]}>{adminStatusLabel[status]}{r.revoked_at ? ` ${day(r.revoked_at)}` : ''}</Badge>],
    ['Licensee', p.licensee ?? 'Not given'],
    ['Buyer', r.buyer_name ?? 'Not given'],
    ['Pack', `${packName(p)}, up to ${p.max_servers} servers`],
    ['Kind', kindNames[p.kind]],
    ['License duration', licenseDurationText(p)],
    ['Issued', dayTime(new Date(p.issued_at))],
    ['Organization', org ? <a key="o" href={href(`/admin/orgs/${org.id}`)}>{org.name}</a> : 'None'],
    ['Customer', p.customer.includes('@') ? 'Buyer email (in the key)' : p.customer],
    ['Source', r.source === 'manual' ? 'Manual (bank transfer / invoice)' : 'Card checkout (Stripe)'],
    ['Amount', r.amount_total !== null && r.amount_total !== undefined ? money(r.amount_total, r.currency) : 'Unknown'],
    ['Paid', r.paid_at ? dayTime(new Date(r.paid_at)) : r.source === 'stripe' && !r.supersedes ? `${dayTime(new Date(p.issued_at))} (issued)` : '—'],
    ...(refunded
      ? ([
          [
            'Refunded',
            `${money(refunded.refunded, refunded.root.currency)}${refunded.charged ? ` of ${money(refunded.charged, refunded.root.currency)}` : ''}${refunded.left ? ' (partial)' : ''}${refunded.root.refunded_at ? `, last ${day(refunded.root.refunded_at)}` : ''}${refunded.root.payload.id !== p.id ? ` (payment of ${refunded.root.payload.id})` : ''}`,
          ],
        ] as [string, string][])
      : []),
    ...(r.payment_ref ? ([['Payment reference', r.payment_ref]] as [string, string][]) : []),
    ['Order reference', r.session_id],
    ...(r.invoice_number ? ([['Invoice', r.invoice_number]] as [string, string][]) : []),
    ['Email', emailStatus],
    ...(detail.founderNumber ? ([['Founder #', `#${detail.founderNumber}`]] as [string, string][]) : []),
    ...(r.supersedes ? ([['Replaces', <a key="rp" href={href(`/admin/licenses/${r.supersedes}`)}>{r.supersedes}</a>]] as [string, React.ReactNode][]) : []),
    ...(r.superseded_by ? ([['Replaced by', <a key="rb" href={href(`/admin/licenses/${r.superseded_by}`)}>{r.superseded_by}</a>]] as [string, React.ReactNode][]) : []),
    ...(detail.order ? ([['Manual order', <a key="mo" href={href(`/admin/orders/${detail.order.id}`)}>{detail.order.id.slice(0, 8)}</a>]] as [string, React.ReactNode][]) : []),
    ['Mode', r.livemode ? 'Live' : 'Test'],
  ];

  return (
    <>
      <PageTitle sub={<Muted>{p.id}</Muted>}>
        {p.licensee ?? 'No licensee'} · {packName(p)}
      </PageTitle>

      <DetailList rows={rows} />

      {(stripe.length > 0 || r.invoice_number) && (
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2, fontSize: '0.9375rem' }} data-testid="stripe-links">
          {stripe.map((l) => (
            <External key={l.href} href={l.href}>
              Stripe: {l.label}
            </External>
          ))}
          {r.invoice_number && <External href={stripeInvoiceSearch(r.invoice_number, r.livemode)}>Stripe: invoice {r.invoice_number}</External>}
        </Box>
      )}

      <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
        <Box>
          <Box sx={{ color: color.muted, fontSize: '0.875rem', mb: 0.75 }}>License key</Box>
          <CodeBlock code={r.token} what="license key" size="sm" />
        </Box>
        <PublicCheckLink url={`${site}/verify/${p.id}`} />
      </Box>

      {detail.chain.length > 1 && (
        <Panel title="Reissue history">
          <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
            {detail.chain.map((c) => (
              <li key={c.licenseId}>
                {c.licenseId === p.id ? <strong>{c.licenseId}</strong> : <a href={href(`/admin/licenses/${c.licenseId}`)}>{c.licenseId}</a>} · issued {day(c.issuedAt)}
                {c.current ? ' · current' : ''}
              </li>
            ))}
          </Box>
        </Panel>
      )}

      <Panel title="Resend the license email">
        <AdminForm action={resendAction} submitLabel="Send the key again" pendingLabel="Sending…" testId="resend-form">
          <input type="hidden" name="licenseId" value={p.id} />
          <TextField
            name="email"
            label="Buyer email"
            type="email"
            autoComplete="off"
            helperText={`It must be the address the license was bought with (checked against the hash we keep).${r.source === 'stripe' ? ' Leave empty to use the one from the Stripe checkout.' : ''}`}
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
        </AdminForm>
      </Panel>

      {current && (
        <Panel title="Reissue">
          <Box sx={{ mb: 2, fontSize: '0.9375rem', maxWidth: '70ch' }}>
            Signs a new key with these terms and marks this one replaced. The old key keeps working offline; the public check shows it as replaced by the new
            id. Use it for corrected dates or licensee, or a pack upgrade after the buyer paid the difference.
          </Box>
          <ApprovedForm action={reissueAction} approval={{ action: 'license.reissue', target: p.id }} submitLabel="Reissue" pendingLabel="Signing…" columns={2} confirm="Sign a new key and mark this one replaced?" testId="reissue-form">
            <input type="hidden" name="licenseId" value={p.id} />
            <TermsFields
              values={{
                licensee: p.licensee ?? '',
                product: p.product,
                pack: p.pack,
                // Empty, so a pack change takes the new pack's limit; type a number to keep a custom one.
                maxServers: '',
                kind: p.kind,
                startDay: p.kind === 'event' ? (p.valid_from ?? '') : '',
                endDay: p.kind === 'event' ? (p.valid_to ?? '') : p.kind === 'year' ? p.updates_until : '',
              }}
              mode="reissue"
              currentMaxServers={p.max_servers}
            />
            <TextField name="amount" label="Difference paid (optional)" inputMode="decimal" slotProps={{ htmlInput: { maxLength: 15 } }} />
            <TextField select name="currency" label="Currency" defaultValue="eur" slotProps={{ select: { native: true } }}>
              <option value="eur">EUR</option>
              <option value="nok">NOK</option>
            </TextField>
            <TextField name="paymentRef" label="Payment reference (optional)" slotProps={{ htmlInput: { maxLength: 200 } }} />
            <TextField name="reason" label="Reason (for the log)" slotProps={{ htmlInput: { maxLength: 300 } }} />
            <TextField
              name="sendTo"
              label="Email the new key to (optional)"
              type="email"
              autoComplete="off"
              helperText="Only the address it was bought with works."
              slotProps={{ htmlInput: { maxLength: 254 } }}
              sx={{ gridColumn: '1 / -1' }}
            />
          </ApprovedForm>
        </Panel>
      )}

      {current && payment && (payment.left === null || payment.left > 0 || payment.via === 'stripe') && (
        <Panel title="Refund">
          <Box sx={{ mb: 2, fontSize: '0.9375rem', maxWidth: '70ch' }}>
            {payment.via === 'stripe'
              ? `Refunds the card payment through Stripe${payment.root.payload.id !== p.id ? ` (the checkout of ${payment.root.payload.id}; a difference paid by bank for a reissue isn’t part of it)` : ''}, once you confirm it through a link emailed to your own address (it works for 15 minutes, only for you). Nothing moves until then. A full refund marks the license refunded: the public check says revoked, the console stops showing it, and it leaves revenue and the VAT total. A partial refund keeps the license valid and takes the amount off revenue.`
              : 'This license wasn’t paid through Stripe. Make the refund in the bank first, then record it here (confirmed through a link emailed to you): a full refund marks the license refunded, a partial one keeps it valid and takes the amount off revenue.'}
          </Box>
          {pending.length > 0 && (
            <Box sx={{ mb: 3, display: 'grid', gap: 1.5 }} data-testid="pending-refunds">
              {pending.map((q) => (
                <Box key={q.id} sx={{ border: `1px solid ${color.rule}`, borderRadius: 1, p: 1.5, display: 'grid', gap: 1 }}>
                  <Box sx={{ fontSize: '0.9375rem' }}>
                    <strong>Waiting for email confirmation:</strong> {moneyText(q.amount, q.currency)}, asked by {q.askedBy ?? 'an admin'} at {dayTime(q.createdAt)}; the link
                    expires {dayTime(q.expiresAt)}.{q.status === 'confirming' ? ' Being confirmed right now.' : ''}
                  </Box>
                  {q.status === 'pending' && (
                    <AdminForm action={cancelRefundRequestAction} submitLabel="Cancel" pendingLabel="Cancelling…" tone="error" testId="cancel-refund-request">
                      <input type="hidden" name="requestId" value={q.id} />
                    </AdminForm>
                  )}
                </Box>
              ))}
            </Box>
          )}
          {canEmail ? (
            <RefundForm
              action={requestRefundAction}
              licenseId={p.id}
              licensee={p.licensee ?? 'no licensee'}
              currency={payment.root.currency ?? 'eur'}
              left={payment.left}
              via={payment.via}
            />
          ) : (
            <Box role="alert" sx={{ color: color.ban, fontSize: '0.9375rem' }}>
              {REFUNDS_NEED_EMAIL}
            </Box>
          )}
        </Panel>
      )}

      {!r.revoked_at && (
        <Panel title="Mark refunded or revoked">
          <Box sx={{ mb: 2, fontSize: '0.9375rem', maxWidth: '70ch' }}>
            Marks the license refunded or revoked without moving any money; nothing is deleted. The public check then says revoked, and the console and
            /license stop showing the key. A refunded license no longer counts as revenue. To give the money back, use Refund above.
          </Box>
          <ApprovedForm action={revokeAction} approval={{ action: 'license.revoke', target: p.id }} submitLabel="Mark it" tone="error" confirm="Mark this license refunded or revoked? This can't be undone here." testId="revoke-form">
            <input type="hidden" name="licenseId" value={p.id} />
            <TextField select name="reason" label="What happened" defaultValue="refunded" slotProps={{ select: { native: true } }}>
              <option value="refunded">Refunded</option>
              <option value="revoked">Revoked (no refund)</option>
            </TextField>
            <TextField name="note" label="Note (optional)" multiline minRows={2} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          </ApprovedForm>
        </Panel>
      )}

      <Panel title="Notes">
        <AdminForm action={addLicenseNoteAction} submitLabel="Add note" testId="note-form">
          <input type="hidden" name="licenseId" value={p.id} />
          <TextField name="body" label="Note" required multiline minRows={2} slotProps={{ htmlInput: { maxLength: 4000 } }} />
        </AdminForm>
        {detail.notes.length > 0 && (
          <Box component="ul" sx={{ m: 0, mt: 3, p: 0, listStyle: 'none', display: 'grid', gap: 2 }} data-testid="notes">
            {detail.notes.map((n) => (
              <Box component="li" key={n.id} sx={{ borderTop: `1px solid ${color.rule}`, pt: 1.5 }}>
                <Muted>
                  {dayTime(n.createdAt)}
                  {n.author ? ` · ${n.author}` : ''}
                </Muted>
                <Box sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: color.ink, mt: 0.5 }}>{n.body}</Box>
              </Box>
            ))}
          </Box>
        )}
      </Panel>

      <Panel title="History">
        <DataTable
          label="History"
          empty="No recorded changes."
          columns={[
            { key: 'at', label: 'When' },
            { key: 'action', label: 'What' },
            { key: 'who', label: 'Who' },
            { key: 'details', label: 'Details' },
          ]}
          rows={detail.history.map((h) => ({
            key: String(h.id),
            cells: {
              at: dayTime(h.at),
              action: `${h.action}${h.targetId && h.targetId !== p.id ? ` (${h.targetId})` : ''}`,
              who: h.actor ?? 'system',
              details: Object.keys(h.details).length > 0 ? <Box component="code" sx={{ fontSize: '0.8125rem' }}>{JSON.stringify(h.details)}</Box> : null,
            },
          }))}
        />
      </Panel>
    </>
  );
}
