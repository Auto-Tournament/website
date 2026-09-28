'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import { sameOrigin } from '@/lib/site';
import { packIn, type PackId, type PackProduct, type PackSize } from '@/components/pricing';
import { getPacks } from '@/lib/stripePrices';
import { audit } from '@/lib/console/audit';
import { consoleEnabled } from '@/lib/console/auth';
import { limits } from '@/lib/console/limits';
import { EMAIL, type ConsoleUser } from '@/lib/console/orgs';
import { currentUser } from '@/lib/console/session';
import { consoleHref, consoleOrigin, consoleUrl } from '@/lib/console/urls';
import { isAdminUser } from '@/lib/admin/access';
import {
  addNote,
  AdminError,
  cancelOrder,
  checkTerms,
  createManualOrder,
  isDay,
  licenseById,
  line,
  markOrderPaid,
  reissueLicense,
  revokeLicense,
  textBlock,
  type LicenseTerms,
} from '@/lib/admin/licenses';
import { createFreeLan, updateLead } from '@/lib/admin/leads';
import { emailLicense, emailRefund, type DeliverResult } from '@/lib/license/deliver';
import { isRefundReason, RefundError, type RefundClient } from '@/lib/license/refund';
import {
  cancelRefundRequest,
  confirmRefundRequest,
  createRefundRequest,
  REFUND_TOKEN,
  REFUNDS_NEED_EMAIL,
  withdrawRefundRequest,
  type Confirmed,
  type CreatedRequest,
} from '@/lib/license/refundRequests';
import { packName } from '@/lib/license/describe';
import { emailConfig, sendEmail } from '@/lib/email/postmark';
import { moneyText, refundConfirmEmail } from '@/lib/console/emails';
import { CHECKOUT_SESSION_ID } from '@/lib/license/format';
import { stripeServer } from '@/lib/license/issue';
import { licenseSigningKey } from '@/lib/license/keys';
import { isCurrency, parseAmount } from '@/lib/license/sales';
import type { ActionState } from '../actions';

/**
 * Every admin CRM write. Like the console's actions (src/app/console/actions.ts):
 * Next checks the Origin against the host, and each action checks
 * Sec-Fetch-Site/Origin again, reads the user from the session, and is
 * rate-limited. On top: the user must be an admin right now (is_admin, a
 * verified email, and that email in ADMIN_EMAILS); anyone else gets "Not
 * found.", as the pages answer 404. Writes go into audit_log with the admin as
 * the actor. Nothing here logs an email address, key or token.
 */

const text = (fd: FormData, key: string, max = 400): string => {
  const v = fd.get(key);
  return typeof v === 'string' ? v.slice(0, max) : '';
};

type Kind = 'write' | 'sensitive' | 'refund-request' | 'refund';

/** The signed-in admin for a write, or an error state. */
async function adminWriter(kind: Kind = 'write'): Promise<{ user: ConsoleUser } | { error: string }> {
  if (!consoleEnabled()) return { error: 'Not found.' };
  const h = (await headers()) as unknown as Headers;
  if (!sameOrigin(h, consoleOrigin())) return { error: 'Forbidden.' };
  const user = await currentUser();
  if (!user || !isAdminUser(user)) return { error: 'Not found.' };
  const now = Date.now();
  if (!limits.adminWrite(user.id, now)) return { error: 'Too many changes at once. Wait a minute.' };
  if (kind !== 'write' && !limits.adminSensitive(user.id, now)) return { error: 'Too many of these at once. Wait a few minutes.' };
  if (kind === 'refund-request' && !limits.adminRefundRequest(user.id, now)) return { error: 'Too many refund requests in the last hour. Wait a while.' };
  if (kind === 'refund' && !limits.adminRefund(user.id, now)) return { error: 'Too many refunds in the last hour. Wait a while.' };
  return { user };
}

function failed(err: unknown): ActionState {
  if (err instanceof AdminError) return { error: err.message };
  console.error('[admin] action failed', dbError(err));
  return { error: 'Something went wrong. Try again.' };
}

const refresh = () => revalidatePath('/console/admin', 'layout');

/** The pack's server limit (from Stripe, or the fallback packs). */
async function packLimits(): Promise<(product: PackProduct, pack: PackSize) => number | null> {
  const { packs } = await getPacks();
  return (product, pack) => {
    try {
      return packIn(packs, `${product}-${pack.toLowerCase()}` as PackId).maxServers;
    } catch {
      return null;
    }
  };
}

function termsFrom(fd: FormData): Record<string, string> {
  return {
    licensee: text(fd, 'licensee', 300),
    product: text(fd, 'product', 20),
    pack: text(fd, 'pack', 4),
    maxServers: text(fd, 'maxServers', 10),
    kind: text(fd, 'kind', 20),
    startDay: text(fd, 'startDay', 20),
    endDay: text(fd, 'endDay', 20),
  };
}

function emailFrom(fd: FormData, key = 'email'): string | null | 'invalid' {
  const raw = text(fd, key, 320).trim().toLowerCase();
  if (!raw) return null;
  return EMAIL.test(raw) && raw.length <= 254 ? raw : 'invalid';
}

const sentText: Record<DeliverResult, string> = {
  sent: 'The key was emailed.',
  skipped: 'The key was not emailed (a send was already running). Try again in a few minutes.',
  failed: 'The key was not emailed: the address doesn’t match the one it was bought with, or the send failed.',
  disabled: 'Email is off here (no POSTMARK_SERVER_TOKEN), so the key was not emailed.',
};

// ---------------------------------------------------------------------------
// Notes

export async function addLicenseNoteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter();
  if ('error' in w) return { error: w.error };
  try {
    await addNote(db(), w.user, 'license', text(fd, 'licenseId', 80), text(fd, 'body', 4000));
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Note added.' };
}

export async function addOrgNoteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter();
  if ('error' in w) return { error: w.error };
  try {
    await addNote(db(), w.user, 'organization', text(fd, 'orgId', 64), text(fd, 'body', 4000));
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Note added.' };
}

// ---------------------------------------------------------------------------
// Licenses

export async function reissueAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter('sensitive');
  if ('error' in w) return { error: w.error };
  const key = licenseSigningKey();
  if (!key) return { error: 'License signing is not set up (LICENSE_SIGNING_KEY), so no key can be issued.' };
  const terms = checkTerms(termsFrom(fd), { defaultMaxServers: await packLimits() });
  if (typeof terms === 'string') return { error: terms };
  const amountRaw = text(fd, 'amount', 20).trim();
  const amount = amountRaw ? parseAmount(amountRaw) : null;
  if (amountRaw && amount === null) return { error: 'The amount must be a number, like 250 or 250.50.' };
  const currency = text(fd, 'currency', 3);
  if (amount && !isCurrency(currency)) return { error: 'Choose EUR or NOK.' };
  const email = emailFrom(fd, 'sendTo');
  if (email === 'invalid') return { error: 'Enter a valid email address to send the new key to, or leave it empty.' };
  const licenseId = text(fd, 'licenseId', 80);
  let newId: string;
  let sessionId: string;
  try {
    const record = await reissueLicense(
      db(),
      w.user,
      licenseId,
      { terms, amount, currency: amount && isCurrency(currency) ? currency : null, paymentRef: line(text(fd, 'paymentRef'), 200), reason: line(text(fd, 'reason'), 300) },
      key,
    );
    newId = record.payload.id;
    sessionId = record.session_id;
  } catch (err) {
    return failed(err);
  }
  console.info('[admin] license reissued', { id: licenseId, new_id: newId });
  if (email) await emailLicense(sessionId, email, { again: true });
  refresh();
  redirect(consoleHref(`/admin/licenses/${newId}`));
}

export async function revokeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter('sensitive');
  if ('error' in w) return { error: w.error };
  const reason = text(fd, 'reason', 20);
  if (reason !== 'refunded' && reason !== 'revoked') return { error: 'Choose refunded or revoked.' };
  try {
    await revokeLicense(db(), w.user, text(fd, 'licenseId', 80), reason, textBlock(text(fd, 'note', 4000)));
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: reason === 'refunded' ? 'Marked refunded.' : 'Revoked.' };
}

const refundSentText: Record<DeliverResult, string> = {
  sent: 'The buyer was emailed.',
  skipped: 'The buyer was not emailed.',
  failed: 'The buyer was not emailed: no address from Stripe, it doesn’t match the one the license was bought with, or the send failed.',
  disabled: 'Email is off here (no POSTMARK_SERVER_TOKEN), so the buyer was not emailed.',
};

/**
 * The Refund button. It doesn't refund: it creates a pending request and
 * emails the signed-in admin's own verified address a link to confirm it
 * (src/lib/license/refundRequests.ts). Without email set up, refunds are
 * refused: there is no way around the confirmation.
 */
export async function requestRefundAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter('refund-request');
  if ('error' in w) return { error: w.error };
  const config = emailConfig();
  if (!config) return { error: REFUNDS_NEED_EMAIL };
  // isAdminUser checked both: a verified address, in ADMIN_EMAILS.
  const adminEmail = w.user.email;
  if (!adminEmail || !w.user.emailVerified) return { error: 'Not found.' };
  const licenseId = text(fd, 'licenseId', 80);
  const reason = text(fd, 'reason', 40);
  if (!isRefundReason(reason)) return { error: 'Choose a reason.' };
  const amountRaw = text(fd, 'amount', 20).trim();
  const amount = amountRaw ? parseAmount(amountRaw) : null;
  if (amountRaw && (amount === null || amount <= 0)) return { error: 'The amount must be a number above 0, like 20 or 20.50. Leave it empty for a full refund.' };
  const refundedOn = text(fd, 'refundedOn', 20).trim();
  if (refundedOn && !isDay(refundedOn)) return { error: 'The refund date must be a date (YYYY-MM-DD).' };
  const sendTo = emailFrom(fd, 'sendTo');
  if (sendTo === 'invalid') return { error: 'Enter a valid email address, or leave it empty.' };
  const notify = text(fd, 'notify', 5) === 'yes';
  const now = new Date();
  let created: CreatedRequest;
  try {
    created = await createRefundRequest(
      db(),
      w.user,
      licenseId,
      {
        amount,
        reason,
        note: textBlock(text(fd, 'note', 4000)),
        notifyBuyer: notify,
        sendTo,
        manual: { refundedOn: refundedOn || null, reference: line(text(fd, 'reference'), 200) },
      },
      now,
    );
  } catch (err) {
    if (err instanceof RefundError) return { error: err.message };
    return failed(err);
  }
  const link = `${consoleUrl('/refunds/confirm')}?token=${encodeURIComponent(created.token)}`;
  const p = created.record.payload;
  const mail = refundConfirmEmail({
    confirmLink: link,
    cancelLink: `${link}&cancel=1`,
    licenseId: p.id,
    licensee: p.licensee ?? null,
    pack: packName(p),
    amount: created.request.amount,
    currency: created.request.currency,
    reason,
    via: created.via,
    requestedBy: w.user.name ? `${w.user.name} (${adminEmail})` : adminEmail,
    requestedAt: now,
  });
  const sent = await sendEmail({ to: adminEmail, ...mail, tag: 'admin-refund-confirm' }, config);
  if (!sent.ok) {
    await withdrawRefundRequest(db(), created.request.id).catch(() => {});
    console.error('[admin] refund confirmation email failed', { id: p.id, error: sent.error });
    refresh();
    return { error: 'The confirmation email could not be sent, so the refund was not asked for. Nothing was refunded. Try again in a few minutes.' };
  }
  console.info('[admin] refund requested', { id: p.id, request: created.request.id });
  refresh();
  return { ok: `Check your email to confirm this refund of ${moneyText(created.request.amount, created.request.currency)} (expires in 15 minutes). Nothing is refunded until you do.` };
}

/** Cancel a pending refund request from the license page (any admin). */
export async function cancelRefundRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter();
  if ('error' in w) return { error: w.error };
  const id = text(fd, 'requestId', 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'No such request.' };
  try {
    const result = await cancelRefundRequest(db(), { id, admin: w.user });
    refresh();
    return result.cancelled ? { ok: 'Cancelled. Nothing was refunded.' } : { error: 'That request is no longer pending.' };
  } catch (err) {
    return failed(err);
  }
}

/**
 * The Confirm button on the page the emailed link opens (a POST: opening the
 * link does nothing). The signed-in admin must be the one who asked. Makes the
 * refund with the amount, reason and note from the request, then optionally
 * emails the buyer.
 */
export async function confirmRefundAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter('refund');
  if ('error' in w) return { error: w.error };
  const token = text(fd, 'token', 64);
  if (!REFUND_TOKEN.test(token)) return { error: 'This confirmation link isn’t valid. Nothing was refunded.' };
  let confirmed: Confirmed;
  try {
    confirmed = await confirmRefundRequest(db(), w.user, token, { stripe: stripeServer() as RefundClient | null });
  } catch (err) {
    if (err instanceof RefundError) return { error: err.message };
    return failed(err);
  }
  const { outcome, request } = confirmed;
  let emailed = '';
  if (request.notifyBuyer) {
    const to = request.sendTo ?? outcome.buyerEmail;
    const result = to ? await emailRefund(outcome.record, to, outcome) : 'failed';
    await audit(db(), { actor: w.user.id, action: 'license.refund_email', orgId: outcome.record.org_id ?? null, targetType: 'license', targetId: outcome.licenseId, details: { result } }).catch(() => {});
    emailed = ` ${refundSentText[result]}`;
  }
  refresh();
  const money = moneyText(outcome.amount, outcome.currency);
  const what =
    outcome.via === 'stripe'
      ? `Refunded ${money} in Stripe${outcome.status === 'succeeded' ? '' : ` (status: ${outcome.status})`}.`
      : `Recorded a refund of ${money}.`;
  return { ok: `${what} ${outcome.full ? 'The license is marked refunded.' : 'Partial refund: the license stays valid.'}${emailed}` };
}

/** The address a Stripe license was paid with, from its Checkout Session (read-only; needs the site's Stripe key). */
async function stripeSessionEmail(sessionId: string): Promise<string | null> {
  const stripe = stripeServer();
  if (!stripe || !CHECKOUT_SESSION_ID.test(sessionId)) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session.customer_details?.email?.trim().toLowerCase() ?? null;
  } catch (err) {
    console.warn('[admin] could not read the checkout session', err instanceof Stripe.errors.StripeError ? (err.code ?? err.type) : 'unknown error');
    return null;
  }
}

export async function resendAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter('sensitive');
  if ('error' in w) return { error: w.error };
  const record = await licenseById(db(), text(fd, 'licenseId', 80)).catch(() => null);
  if (!record) return { error: 'No such license.' };
  let email = emailFrom(fd);
  if (email === 'invalid') return { error: 'Enter a valid email address.' };
  // Blank: for a card purchase, the address it was paid with (from Stripe). Checked against the license's hash either way.
  if (!email) {
    // A reissue has no Checkout Session of its own: the first license of the chain has it.
    let root = record;
    for (let i = 0; root.supersedes && i < 20; i++) root = (await licenseById(db(), root.supersedes).catch(() => null)) ?? root;
    email = await stripeSessionEmail(root.session_id);
  }
  if (!email) return { error: 'Enter the address the license was bought with.' };
  const result = await emailLicense(record.session_id, email, { again: true });
  await audit(db(), { actor: w.user.id, action: 'license.resend', orgId: record.org_id ?? null, targetType: 'license', targetId: record.payload.id, details: { result } }).catch(() => {});
  refresh();
  return result === 'sent' ? { ok: sentText.sent } : { error: sentText[result] };
}

// ---------------------------------------------------------------------------
// Manual licenses (bank transfer / invoice)

export async function createManualAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter('sensitive');
  if ('error' in w) return { error: w.error };
  const terms = checkTerms(termsFrom(fd), { defaultMaxServers: await packLimits() });
  if (typeof terms === 'string') return { error: terms };
  if (!terms.licensee) return { error: 'Enter the licensee.' };
  const amount = parseAmount(text(fd, 'amount', 20));
  if (amount === null) return { error: 'Enter the amount, like 1490 or 1490.50.' };
  const currency = text(fd, 'currency', 3);
  if (!isCurrency(currency)) return { error: 'Choose EUR or NOK.' };
  const email = emailFrom(fd);
  if (email === 'invalid') return { error: 'Enter a valid buyer email, or leave it empty.' };
  const paid = text(fd, 'paid', 5) === 'yes';
  const send = text(fd, 'send', 5) === 'yes';
  const orgId = text(fd, 'orgId', 64).trim() || null;
  let result: Awaited<ReturnType<typeof createManualOrder>>;
  try {
    result = await createManualOrder(
      db(),
      w.user,
      { terms: terms as LicenseTerms & { licensee: string }, orgId, email, amount, currency, paymentRef: line(text(fd, 'paymentRef'), 200), paid },
      paid ? licenseSigningKey() : null,
    );
  } catch (err) {
    return failed(err);
  }
  if (result.record && email && send) await emailLicense(result.record.session_id, email, { again: true });
  refresh();
  redirect(consoleHref(result.record ? `/admin/licenses/${result.record.payload.id}` : `/admin/orders/${result.order.id}`));
}

export async function markPaidAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter('sensitive');
  if ('error' in w) return { error: w.error };
  const key = licenseSigningKey();
  if (!key) return { error: 'License signing is not set up (LICENSE_SIGNING_KEY), so no key can be issued.' };
  const paidOn = text(fd, 'paidOn', 20).trim() || null;
  if (paidOn && !isDay(paidOn)) return { error: 'The payment date must be a date (YYYY-MM-DD).' };
  const email = emailFrom(fd);
  if (email === 'invalid') return { error: 'Enter a valid buyer email, or leave it empty.' };
  let licenseId: string;
  let sessionId: string;
  try {
    const record = await markOrderPaid(db(), w.user, text(fd, 'orderId', 64), { paymentRef: line(text(fd, 'paymentRef'), 200), paidOn }, key);
    licenseId = record.payload.id;
    sessionId = record.session_id;
  } catch (err) {
    return failed(err);
  }
  if (email) await emailLicense(sessionId, email, { again: true });
  refresh();
  redirect(consoleHref(`/admin/licenses/${licenseId}`));
}

export async function cancelOrderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter();
  if ('error' in w) return { error: w.error };
  try {
    await cancelOrder(db(), w.user, text(fd, 'orderId', 64));
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Order cancelled.' };
}

// ---------------------------------------------------------------------------
// Leads and free LANs

export async function updateLeadAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter();
  if ('error' in w) return { error: w.error };
  try {
    await updateLead(db(), w.user, text(fd, 'leadId', 64), { status: text(fd, 'status', 20), note: text(fd, 'note', 4000) });
  } catch (err) {
    return failed(err);
  }
  refresh();
  return { ok: 'Saved.' };
}

export async function createFreeLanAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const w = await adminWriter();
  if ('error' in w) return { error: w.error };
  const fields = ['event', 'organizer', 'dates', 'servers', 'confirmedOn', 'note', 'leadId'] as const;
  try {
    await createFreeLan(db(), w.user, Object.fromEntries(fields.map((k) => [k, text(fd, k, k === 'note' ? 4000 : 300)])));
  } catch (err) {
    return failed(err);
  }
  refresh();
  redirect(consoleHref('/admin/free-lans'));
}
