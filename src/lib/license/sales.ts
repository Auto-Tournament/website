/**
 * Paid license sales: the rows that count as revenue. Shared by the VAT
 * threshold check (src/lib/vat/threshold.ts), the admin overview and the
 * bookkeeping CSV export.
 *
 * A sale is a live-mode license row with its amount (Stripe checkout, a paid
 * manual license, or the difference paid for a reissue), dated by paid_at
 * (issued_at before that column existed), net of partial refunds
 * (refunded_amount). Refunded licenses don't count; a
 * revoked one (not refunded) still does, the money was kept. A superseded
 * license still counts: its replacement carries only a difference, never the
 * amount again.
 *
 * Relative imports on purpose: the tests run these against PGlite.
 */
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { licenses, organizations, type LicenseSource } from '../db/schema';
import type { LicensePayload } from './format';

export type Currency = 'eur' | 'nok';
export const CURRENCIES: readonly Currency[] = ['eur', 'nok'];
export const isCurrency = (v: unknown): v is Currency => v === 'eur' || v === 'nok';

export type Sale = {
  licenseId: string;
  sessionId: string;
  payload: LicensePayload;
  source: LicenseSource;
  /** Minor units of `currency`, net of partial refunds; 0 when unknown (rows from before amounts were kept). */
  amountTotal: number;
  currency: Currency;
  paidAt: Date;
  paymentRef: string | null;
  invoiceNumber: string | null;
  country: string | null;
};

const paidDay = sql`coalesce(${licenses.paidAt}, ${licenses.issuedAt})`;

/** Not refunded. */
export const notRefunded = or(isNull(licenses.revokeReason), sql`${licenses.revokeReason} <> 'refunded'`);

/** Live-mode, not refunded sales paid in [from, to], oldest first (or newest first with `newest`). */
export async function salesBetween(db: Db, from: Date, to: Date, options: { newest?: boolean } = {}): Promise<Sale[]> {
  const rows = await db
    .select({
      licenseId: licenses.licenseId,
      sessionId: licenses.sessionId,
      payload: licenses.payload,
      source: licenses.source,
      amountTotal: licenses.amountTotal,
      refundedAmount: licenses.refundedAmount,
      currency: licenses.currency,
      paidAt: licenses.paidAt,
      issuedAt: licenses.issuedAt,
      paymentRef: licenses.paymentRef,
      invoiceNumber: licenses.invoiceNumber,
      country: organizations.country,
    })
    .from(licenses)
    .leftJoin(organizations, eq(organizations.id, licenses.orgId))
    .where(
      and(
        eq(licenses.livemode, true),
        notRefunded,
        // As text with a cast: postgres-js can't bind a Date inside raw SQL (PGlite can, so tests alone wouldn't catch it).
        gte(paidDay, sql`${from.toISOString()}::timestamptz`),
        lte(paidDay, sql`${to.toISOString()}::timestamptz`),
      ),
    )
    .orderBy(options.newest ? desc(paidDay) : asc(paidDay));
  return rows.map((r) => ({
      licenseId: r.licenseId,
      sessionId: r.sessionId,
      payload: r.payload,
      source: r.source,
      // Net of partial refunds (a full refund leaves the sales altogether).
      amountTotal: Math.max(0, (r.amountTotal ?? 0) - (r.refundedAmount ?? 0)),
      currency: isCurrency(r.currency) ? r.currency : 'eur',
      paidAt: r.paidAt ?? r.issuedAt,
      paymentRef: r.paymentRef,
      invoiceNumber: r.invoiceNumber,
      country: r.country,
  }));
}

/** An amount in minor units of `currency`, in NOK (major units) at `eurNok` NOK per EUR. */
export function toNok(amountMinor: number, currency: Currency, eurNok: number): number {
  return currency === 'nok' ? amountMinor / 100 : (amountMinor / 100) * eurNok;
}

/** The same in EUR (major units). */
export function toEur(amountMinor: number, currency: Currency, eurNok: number): number {
  return currency === 'eur' ? amountMinor / 100 : amountMinor / 100 / eurNok;
}

export type Totals = { count: number; eur: number; nok: number };

/** Count, and the sum in EUR and NOK (each sale converted at `eurNok`). Sales with no amount count as 0. */
export function totals(sales: Sale[], eurNok: number): Totals {
  let eur = 0;
  let nok = 0;
  for (const s of sales) {
    eur += toEur(s.amountTotal, s.currency, eurNok);
    nok += toNok(s.amountTotal, s.currency, eurNok);
  }
  return { count: sales.length, eur, nok };
}

/** Plain and unambiguous for the admin: "EUR 1,234.00". */
export function formatMoney(amountMajor: number, currency: Currency | string): string {
  return `${currency.toUpperCase()} ${amountMajor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Major units → minor units, from a form value like "1234.50" or "1 234,50". Null when it isn't an amount. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

// ---------------------------------------------------------------------------
// Bookkeeping export

const csvCell = (v: string | number | null): string => {
  if (v === null) return '';
  let s = String(v);
  // Spreadsheet formula injection: a cell that starts like a formula gets a leading quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Paid sales as CSV: date, license id, licensee, country, amount, currency,
 * NOK amount, payment reference, and the EUR/NOK rate used. `rateOn` gives the
 * rate for a sale's day (Norges Bank, that day or the business day before).
 */
export function salesCsv(sales: Sale[], rateOn: (day: string) => number): string {
  const header = ['date', 'license_id', 'licensee', 'country', 'amount', 'currency', 'amount_nok', 'payment_ref', 'eur_nok_rate'];
  const lines = sales.map((s) => {
    const date = s.paidAt.toISOString().slice(0, 10);
    const rate = rateOn(date);
    return [
      date,
      s.licenseId,
      s.payload.licensee ?? '',
      s.country,
      (s.amountTotal / 100).toFixed(2),
      s.currency.toUpperCase(),
      toNok(s.amountTotal, s.currency, rate).toFixed(2),
      s.paymentRef ?? s.invoiceNumber ?? (s.source === 'stripe' ? s.sessionId : null),
      s.currency === 'nok' ? '' : rate.toFixed(4),
    ]
      .map(csvCell)
      .join(',');
  });
  return `${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
