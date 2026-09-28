import 'server-only';
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { packIn } from '@/components/pricing';
import { getPacks } from '@/lib/stripePrices';
import { checkSession, emailHash, payloadForSession, sessionEmail, signLicense, type SessionLike } from './format';
import { emailLicense } from './deliver';
import { licenseSigningKey } from './keys';
import { licenseStore, type LicenseRecord } from './store';
import { db } from '@/lib/db/client';
import { dbError } from '@/lib/db/errors';
import { licenseIssuedToOrg, orgForCheckout } from '@/lib/console/orgs';
import { stripeLivemode } from '@/lib/stripeMode';
import { checkVatThreshold } from '@/lib/vat/threshold';

/**
 * Issues the license key for a paid Checkout Session, once. Called by the
 * Stripe webhook (checkout.session.completed / async_payment_succeeded) and
 * by the thanks page (so the buyer sees the key even when the webhook is
 * late). Both go through the store's issueOnce, so a session gets one key.
 * Then the key is emailed to the address paid with, once (./deliver.ts; off
 * without POSTMARK_SERVER_TOKEN). A failed email never fails the issuing.
 */

export type IssueResult =
  | { status: 'issued' | 'existing'; record: LicenseRecord }
  | { status: 'not_license' | 'not_paid' | 'disabled' };

let client: { key: string; stripe: Stripe } | null = null;

export function stripeServer(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (client?.key !== key) client = { key, stripe: new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 }) };
  return client.stripe;
}

/** The invoice number the buyer sees on the receipt, or null (needs Invoices: Read on the key; optional). */
async function invoiceNumber(stripe: Stripe | null, invoice: Stripe.Checkout.Session['invoice']): Promise<string | null> {
  if (!invoice) return null;
  if (typeof invoice !== 'string') return invoice.number ?? null;
  if (!stripe) return null;
  try {
    return (await stripe.invoices.retrieve(invoice)).number ?? null;
  } catch (err) {
    console.warn('[license] could not read the invoice number', err instanceof Stripe.errors.StripeError ? err.code ?? err.type : 'unknown error');
    return null;
  }
}

export async function issueForSession(session: Stripe.Checkout.Session, now: Date = new Date()): Promise<IssueResult> {
  const check = checkSession(session as unknown as SessionLike);
  if (!check.ok) return { status: check.reason };
  const key = licenseSigningKey();
  if (!key) return { status: 'disabled' };

  // Bought from the console: into that organization, when it still exists. Looked up
  // before issueOnce, which holds a transaction (and its connection) while it runs.
  const orgId = session.metadata?.org_id ? await orgForCheckout(db(), session.metadata.org_id) : null;
  const { record, created } = await licenseStore().issueOnce(session.id, async () => {
    // The limit the buyer paid for, from the session; Stripe's current pack as a fallback for older sessions.
    const maxServers = check.metadataMaxServers ?? packIn((await getPacks()).packs, check.packId).maxServers;
    const { payload, datesFromForm } = payloadForSession(session as unknown as SessionLike, {
      kid: key.kid,
      id: `L-${randomBytes(9).toString('base64url')}`,
      packId: check.packId,
      kind: check.kind,
      maxServers,
      now,
    });
    const email = sessionEmail(session as unknown as SessionLike);
    return {
      session_id: session.id,
      invoice_number: await invoiceNumber(stripeServer(), session.invoice),
      email_sha256: email ? emailHash(email) : null,
      livemode: session.livemode,
      dates_from_form: datesFromForm,
      payload,
      token: signLicense(payload, key),
      org_id: orgId,
      // amount_total is null for a fully-discounted ($0) session; that is a real 0, not "unknown".
      amount_total: session.amount_total ?? 0,
      currency: session.currency ?? null,
      paid_at: now.toISOString(),
      // For the refund webhook (charge.refunded carries the PaymentIntent, not the session).
      payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null),
    };
  });
  if (created) {
    console.info('[license] issued', { id: record.payload.id, kid: record.payload.kid, kind: record.payload.kind, livemode: record.livemode, org: Boolean(record.org_id) });
    if (record.org_id) {
      await licenseIssuedToOrg(db(), record, stripeLivemode()).catch((err) =>
        console.error('[license] could not record the organization purchase', { id: record.payload.id }, dbError(err)),
      );
    }
    if (record.livemode) {
      // Fire-and-forget: a slow or failed VAT check never blocks or fails the webhook / thanks page.
      checkVatThreshold().catch((err) => console.error('[vat] threshold check failed', dbError(err)));
    }
  }
  // Also on 'existing': a webhook retry (or one resent from the Stripe dashboard) sends it when an earlier try failed.
  const email = sessionEmail(session as unknown as SessionLike);
  if (email && !record.emailed_at) await emailLicense(session.id, email);
  return { status: created ? 'issued' : 'existing', record };
}
