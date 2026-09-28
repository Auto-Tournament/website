import { generateKeyPairSync } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyLicense } from '../../../scripts/license-verify.mjs';
import { testDb } from '../db/testing';
import { auditLog, licenses, manualOrders, organizations, users } from '../db/schema';
import { emailHash, signingKeyFrom, type LicensePayload, type SigningKey } from '../license/format';
import { createLicenseStore, toRow, type LicenseRecord } from '../license/store';
import { salesBetween, salesCsv, totals } from '../license/sales';
import { publicCheck } from '../license/verify';
import { founderLimit } from '../../components/pricing';
import {
  AdminError,
  addNote,
  cancelOrder,
  checkTerms,
  createManualOrder,
  founderNumbers,
  licenseDetail,
  listLicenses,
  markOrderPaid,
  reissueLicense,
  revokeLicense,
  type LicenseTerms,
} from './licenses';

let t: Awaited<ReturnType<typeof testDb>>;
let key: SigningKey;
let admin: { id: string };

beforeEach(async () => {
  t = await testDb();
  const { privateKey } = generateKeyPairSync('ed25519');
  key = signingKeyFrom(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  const [u] = await t.db.insert(users).values({ email: 'admin@example.com', emailVerified: new Date(), isAdmin: true }).returning();
  admin = { id: u.id };
});
afterEach(async () => {
  await t.close();
});

const now = new Date('2026-09-28T10:00:00Z');
const today = '2026-09-28';
const noDefault = { defaultMaxServers: () => 20 };

function stripeLicense(n: number, over: Partial<LicenseRecord> = {}, payload: Partial<LicensePayload> = {}): LicenseRecord {
  return {
    session_id: `cs_live_seed${n}`,
    invoice_number: `INV-${n}`,
    email_sha256: emailHash(`buyer${n}@example.com`),
    livemode: true,
    dates_from_form: true,
    token: `ATL1.seed${n}.sig`,
    amount_total: 5900,
    currency: 'eur',
    paid_at: '2026-09-20T10:00:00.000Z',
    payload: {
      v: 1,
      kid: key.kid,
      id: `L-seedLicense${n}`,
      customer: 'cus_SEEDCUSTOMER',
      licensee: `Buyer ${n}`,
      product: 'servers',
      pack: 'M',
      max_servers: 20,
      kind: 'event',
      issued_at: '2026-09-20T10:00:00Z',
      updates_until: '2026-10-05',
      valid_from: '2026-10-03',
      valid_to: '2026-10-05',
      ...payload,
    },
    ...over,
  };
}
const insert = (r: LicenseRecord) => t.db.insert(licenses).values(toRow(r));

const terms = (over: Partial<LicenseTerms> = {}): LicenseTerms => ({
  licensee: 'Buyer 1 AS',
  product: 'servers',
  pack: 'L',
  maxServers: 40,
  kind: 'event',
  startDay: '2026-10-03',
  endDay: '2026-10-06',
  ...over,
});

describe('checkTerms', () => {
  it('fills the server limit from the pack and checks event dates', () => {
    expect(checkTerms({ product: 'servers', pack: 'M', kind: 'founder' }, noDefault)).toMatchObject({ maxServers: 20, kind: 'founder' });
    expect(checkTerms({ product: 'servers', pack: 'M', kind: 'event' }, noDefault)).toMatch(/first and last day/);
    expect(checkTerms({ product: 'servers', pack: 'M', kind: 'event', startDay: '2026-10-01', endDay: '2026-10-06' }, noDefault)).toMatch(/at most 5 days/);
    expect(checkTerms({ product: 'servers', pack: 'M', kind: 'event', startDay: '2026-02-30', endDay: '2026-03-01' }, noDefault)).toMatch(/must be a date/);
    expect(checkTerms({ product: 'servers', pack: 'X', kind: 'event' }, noDefault)).toMatch(/pack size/);
  });
});

describe('reissue', () => {
  it('signs a new key with the new terms and marks the old one superseded; the old id shows "replaced by"', async () => {
    await insert(stripeLicense(1));
    const record = await reissueLicense(t.db, admin, 'L-seedLicense1', { terms: terms(), amount: 4000, currency: 'eur', paymentRef: 'diff-1', reason: 'upgrade' }, key, now);

    // A real, verifiable key with the new terms.
    const verified = verifyLicense(record.token, { publicKeys: { [key.kid]: key.publicJwk }, now: '2026-10-04' });
    expect(verified.valid).toBe(true);
    expect(verified.license).toMatchObject({ pack: 'L', max_servers: 40, valid_from: '2026-10-03', valid_to: '2026-10-06', updates_until: '2026-10-06', customer: 'cus_SEEDCUSTOMER', licensee: 'Buyer 1 AS' });
    expect(record.payload.id).not.toBe('L-seedLicense1');
    expect(record).toMatchObject({ supersedes: 'L-seedLicense1', email_sha256: emailHash('buyer1@example.com'), amount_total: 4000, payment_ref: 'diff-1' });

    const store = createLicenseStore(t.db);
    const old = await store.byLicenseId('L-seedLicense1');
    expect(old?.superseded_by).toBe(record.payload.id);
    // The old key's row is kept as it was: same token, same amount.
    expect(old?.token).toBe('ATL1.seed1.sig');
    expect(old?.amount_total).toBe(5900);
    expect(publicCheck(old, today)).toMatchObject({ status: 'replaced', statusText: `Replaced by ${record.payload.id}`, replacedBy: record.payload.id });
    expect(publicCheck(await store.byLicenseId(record.payload.id), today)).toMatchObject({ status: 'upcoming' });

    // /license with the old order reference or invoice number leads to the new key.
    expect((await store.find('cs_live_seed1', emailHash('buyer1@example.com')))?.payload.id).toBe(record.payload.id);
    expect((await store.find('inv-1', emailHash('buyer1@example.com')))?.payload.id).toBe(record.payload.id);

    const [entry] = await t.db.select().from(auditLog).where(eq(auditLog.action, 'license.reissue'));
    expect(entry).toMatchObject({ actorUserId: admin.id, targetId: 'L-seedLicense1' });
    expect(entry.details).toMatchObject({ new_id: record.payload.id, changed: expect.arrayContaining(['pack', 'max_servers', 'valid_to']) });

    // Revenue: the original sale plus only the difference.
    const sales = await salesBetween(t.db, new Date('2026-01-01'), now);
    expect(totals(sales, 10)).toEqual({ count: 2, eur: 99, nok: 990 });
  });

  it('refuses a license that was already replaced, or refunded', async () => {
    await insert(stripeLicense(1));
    await insert(stripeLicense(2));
    await reissueLicense(t.db, admin, 'L-seedLicense1', { terms: terms(), amount: null, currency: null, paymentRef: null, reason: null }, key, now);
    await expect(reissueLicense(t.db, admin, 'L-seedLicense1', { terms: terms(), amount: null, currency: null, paymentRef: null, reason: null }, key, now)).rejects.toThrow(AdminError);
    await revokeLicense(t.db, admin, 'L-seedLicense2', 'refunded', null, now);
    await expect(reissueLicense(t.db, admin, 'L-seedLicense2', { terms: terms(), amount: null, currency: null, paymentRef: null, reason: null }, key, now)).rejects.toThrow(/refunded or revoked/);
  });

  it('keeps the founder number and the founder count through a reissue', async () => {
    await insert(stripeLicense(1, {}, { kind: 'founder', updates_until: '9999-12-31', valid_from: undefined, valid_to: undefined }));
    await insert(stripeLicense(2, {}, { kind: 'founder', updates_until: '9999-12-31', issued_at: '2026-09-21T10:00:00Z' }));
    const store = createLicenseStore(t.db);
    expect(await store.founderCount()).toBe(2);
    const r = await reissueLicense(t.db, admin, 'L-seedLicense1', { terms: terms({ kind: 'founder', startDay: null, endDay: null }), amount: null, currency: null, paymentRef: null, reason: null }, key, now);
    expect(r.payload.updates_until).toBe('9999-12-31');
    expect(await store.founderCount()).toBe(2);
    const numbers = await founderNumbers(t.db);
    expect(numbers.get(r.payload.id)).toBe(1);
    expect(numbers.get('L-seedLicense2')).toBe(2);
  });
});

describe('refund and revoke', () => {
  it('marks it, never deletes; /verify says revoked; /license stops finding it; a refund leaves the revenue', async () => {
    await insert(stripeLicense(1));
    await insert(stripeLicense(2));
    await revokeLicense(t.db, admin, 'L-seedLicense1', 'refunded', 'Refunded in Stripe', now);
    await revokeLicense(t.db, admin, 'L-seedLicense2', 'revoked', null, now);
    await expect(revokeLicense(t.db, admin, 'L-seedLicense1', 'revoked', null, now)).rejects.toThrow(AdminError);
    const store = createLicenseStore(t.db);
    const refunded = await store.byLicenseId('L-seedLicense1');
    expect(refunded).toMatchObject({ revoke_reason: 'refunded', token: 'ATL1.seed1.sig' });
    expect(publicCheck(refunded, today)).toMatchObject({ status: 'revoked' });
    expect(await store.find('cs_live_seed1', emailHash('buyer1@example.com'))).toBeNull();
    const sales = await salesBetween(t.db, new Date('2026-01-01'), now);
    expect(sales.map((s) => s.licenseId)).toEqual(['L-seedLicense2']);
    const detail = await licenseDetail(t.db, 'L-seedLicense1', today);
    expect(detail?.status).toBe('refunded');
    expect(detail?.notes.map((n) => n.body)).toEqual(['Refunded in Stripe']);
  });
});

describe('manual licenses', () => {
  const input = (over: Partial<Parameters<typeof createManualOrder>[2]> = {}) => ({
    terms: { ...terms({ kind: 'founder', startDay: null, endDay: null }), licensee: 'Invoice Buyer AS' },
    orgId: null,
    email: 'Invoice@Example.com',
    amount: 950000,
    currency: 'nok' as const,
    paymentRef: 'INV-100',
    paid: true,
    ...over,
  });

  it('issues a key at once when paid, counts it as revenue (in NOK) and toward the founder cap', async () => {
    const [org] = await t.db.insert(organizations).values({ name: 'Org AS', country: 'NO', stripeCustomerId: 'cus_ORGCUSTOMER' }).returning();
    const { order, record } = await createManualOrder(t.db, admin, input({ orgId: org.id }), key, now);
    expect(order.status).toBe('paid');
    expect(record).not.toBeNull();
    const verified = verifyLicense(record!.token, { publicKeys: { [key.kid]: key.publicJwk } });
    expect(verified.valid).toBe(true);
    expect(verified.license).toMatchObject({ kind: 'founder', customer: 'cus_ORGCUSTOMER', licensee: 'Invoice Buyer AS', max_servers: 40 });
    expect(record).toMatchObject({ source: 'manual', email_sha256: emailHash('invoice@example.com'), org_id: org.id, amount_total: 950000, currency: 'nok' });
    // The email is kept only as a hash.
    const [row] = await t.db.select().from(manualOrders);
    expect(JSON.stringify(row)).not.toContain('example.com');

    expect(await createLicenseStore(t.db).founderCount()).toBe(1);
    const sales = await salesBetween(t.db, new Date('2026-01-01'), now);
    expect(totals(sales, 10)).toEqual({ count: 1, eur: 950, nok: 9500 });
    expect(salesCsv(sales, () => 10)).toBe(
      'date,license_id,licensee,country,amount,currency,amount_nok,payment_ref,eur_nok_rate\r\n' +
        `2026-09-28,${record!.payload.id},Invoice Buyer AS,NO,9500.00,NOK,9500.00,INV-100,\r\n`,
    );
    const listed = await listLicenses(t.db, { source: 'manual' }, today);
    expect(listed.rows.map((r) => [r.record.payload.id, r.founderNumber, r.orgName])).toEqual([[record!.payload.id, 1, 'Org AS']]);
  });

  it('an unpaid order has no key but holds a founder place; "Mark paid" issues it; cancelling frees the place', async () => {
    const store = createLicenseStore(t.db);
    const { order, record } = await createManualOrder(t.db, admin, input({ paid: false }), null, now);
    expect(record).toBeNull();
    expect(await t.db.select().from(licenses)).toHaveLength(0);
    expect(await store.founderCount()).toBe(1);
    expect(await salesBetween(t.db, new Date('2026-01-01'), now)).toHaveLength(0);

    const issued = await markOrderPaid(t.db, admin, order.id, { paymentRef: 'BANK-7', paidOn: '2026-09-27' }, key, now);
    expect(issued).toMatchObject({ source: 'manual', payment_ref: 'BANK-7', paid_at: '2026-09-27T12:00:00.000Z' });
    expect(await store.founderCount()).toBe(1);
    await expect(markOrderPaid(t.db, admin, order.id, { paymentRef: null, paidOn: null }, key, now)).rejects.toThrow(AdminError);

    const second = await createManualOrder(t.db, admin, input({ paid: false }), null, now);
    expect(await store.founderCount()).toBe(2);
    await cancelOrder(t.db, admin, second.order.id);
    expect(await store.founderCount()).toBe(1);
  });

  it('refuses a founder order once the cap is reached, card sales included', async () => {
    for (let i = 1; i < founderLimit; i++) await insert(stripeLicense(i, {}, { kind: 'founder', updates_until: '9999-12-31' }));
    await createManualOrder(t.db, admin, input({ paid: false }), null, now);
    expect(await createLicenseStore(t.db).founderCount()).toBe(founderLimit);
    await expect(createManualOrder(t.db, admin, input({ paid: false }), null, now)).rejects.toThrow(/sold out/);
    // Past the last day too.
    await t.db.delete(manualOrders);
    await expect(createManualOrder(t.db, admin, input(), key, new Date('2027-04-01T10:00:00Z'))).rejects.toThrow(/sold out/);
  });

  it('needs the signing key to issue a paid one', async () => {
    await expect(createManualOrder(t.db, admin, input(), null, now)).rejects.toThrow(/LICENSE_SIGNING_KEY/);
  });
});

describe('notes', () => {
  it('adds notes to a license, logs that one was added (not the text), and refuses unknown targets', async () => {
    await insert(stripeLicense(1));
    await addNote(t.db, admin, 'license', 'L-seedLicense1', '  Called them.\nAll good. ');
    await expect(addNote(t.db, admin, 'license', 'L-nope123', 'x')).rejects.toThrow(AdminError);
    await expect(addNote(t.db, admin, 'organization', 'not-a-uuid', 'x')).rejects.toThrow(AdminError);
    await expect(addNote(t.db, admin, 'license', 'L-seedLicense1', '   ')).rejects.toThrow(AdminError);
    const detail = await licenseDetail(t.db, 'L-seedLicense1', today);
    expect(detail?.notes.map((n) => [n.body, n.author])).toEqual([['Called them.\nAll good.', 'admin@example.com']]);
    expect(detail?.history.map((h) => [h.action, h.details])).toEqual([['admin.note', { length: 22 }]]);
  });
});

describe('the sales CSV', () => {
  it('quotes commas and guards against spreadsheet formulas', () => {
    const csv = salesCsv(
      [
        {
          licenseId: 'L-x',
          sessionId: 'cs_live_x',
          payload: { licensee: '=HYPERLINK("x"), Inc' } as LicensePayload,
          source: 'stripe',
          amountTotal: 1990,
          currency: 'eur',
          paidAt: new Date('2026-03-01T10:00:00Z'),
          paymentRef: null,
          invoiceNumber: null,
          country: null,
        },
      ],
      () => 11.5,
    );
    expect(csv.split('\r\n')[1]).toBe(`2026-03-01,L-x,"'=HYPERLINK(""x""), Inc",,19.90,EUR,228.85,cs_live_x,11.5000`);
  });
});
