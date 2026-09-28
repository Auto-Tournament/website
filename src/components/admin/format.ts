import type { AdminStatus } from '@/lib/admin/licenses';
import type { LeadStatus } from '@/lib/db/schema';
import { formatMoney } from '@/lib/license/sales';
import type { Tone } from './AdminUi';

/** "2026-09-28" from a Date or ISO string. */
export const day = (d: Date | string | null | undefined): string => (d ? (typeof d === 'string' ? d : d.toISOString()).slice(0, 10) : '');

/** "2026-09-28 10:11" (UTC). */
export const dayTime = (d: Date | null | undefined): string => (d ? `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '');

/** Minor units → "EUR 1,490.00"; empty for no amount. */
export const money = (minor: number | null | undefined, currency: string | null | undefined): string =>
  minor === null || minor === undefined ? '' : formatMoney(minor / 100, currency ?? 'eur');

export const statusTone: Record<AdminStatus, Tone> = {
  active: 'good',
  upcoming: 'info',
  expired: 'muted',
  'updates-ended': 'muted',
  test: 'warn',
  replaced: 'info',
  refunded: 'bad',
  revoked: 'bad',
};

export const leadTone: Record<LeadStatus, Tone> = { new: 'warn', replied: 'info', won: 'good', lost: 'muted' };
export const leadLabel: Record<LeadStatus, string> = { new: 'New', replied: 'Replied', won: 'Won', lost: 'Lost' };

/** Stripe Dashboard links, built from ids (test-mode ids open the test dashboard). */
export function stripeLinks(input: { sessionId: string; customer: string | null; livemode: boolean; paymentIntent?: string | null }): { label: string; href: string }[] {
  const test = !input.livemode || input.sessionId.startsWith('cs_test_');
  const base = test ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
  const out: { label: string; href: string }[] = [];
  if (/^cs_(live|test)_[A-Za-z0-9]+$/.test(input.sessionId)) out.push({ label: 'Checkout session', href: `${base}/checkout/sessions/${input.sessionId}` });
  if (input.paymentIntent && /^pi_[A-Za-z0-9]+$/.test(input.paymentIntent)) out.push({ label: 'Payment', href: `${base}/payments/${input.paymentIntent}` });
  if (input.customer && /^cus_[A-Za-z0-9]+$/.test(input.customer)) out.push({ label: 'Customer', href: `${base}/customers/${input.customer}` });
  return out;
}

/** A Stripe invoice search link by its number (the number, not the in_… id, is what the license keeps). */
export function stripeInvoiceSearch(invoiceNumber: string, livemode: boolean): string {
  const base = livemode ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';
  return `${base}/search?query=${encodeURIComponent(invoiceNumber)}`;
}
