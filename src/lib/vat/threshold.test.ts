import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '../db/client';
import { testDb } from '../db/testing';
import { licenses, vatAlerts } from '../db/schema';
import { emailHash, type LicensePayload } from '../license/format';
import { toRow, type LicenseRecord } from '../license/store';
import { checkVatThreshold, vatThresholdNok, vatAlertsEnabled, DEFAULT_VAT_THRESHOLD_NOK } from './threshold';
import { resetRateCache } from './rate';
import { eq } from 'drizzle-orm';

let t: Awaited<ReturnType<typeof testDb>>;

const okResponse = (rate: string) =>
  Response.json({
    data: { dataSets: [{ series: { '0:0:0:0': { observations: { '0': [rate] } } } }] },
  });

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    kid: 'kid',
    id: `L-${Math.random().toString(36).slice(2)}`,
    customer: 'cus_TEST',
    product: 'servers',
    pack: 'M',
    max_servers: 20,
    kind: 'year',
    issued_at: '2026-09-28T10:00:00Z',
    updates_until: '2027-09-28',
    ...over,
  };
}

function sale(
  sessionId: string,
  { amountCents, paidAt, livemode = true }: { amountCents: number; paidAt: Date; livemode?: boolean },
): LicenseRecord {
  return {
    session_id: sessionId,
    invoice_number: null,
    email_sha256: emailHash('buyer@example.com'),
    livemode,
    dates_from_form: false,
    payload: payload({ id: `L-${sessionId}`, issued_at: paidAt.toISOString() }),
    token: 'ATL1.payload.sig',
    amount_total: amountCents,
    currency: 'eur',
    paid_at: paidAt.toISOString(),
  };
}

async function insert(...records: LicenseRecord[]) {
  await t.db.insert(licenses).values(records.map(toRow));
}

beforeEach(async () => {
  t = await testDb();
  setDb(t.db);
  resetRateCache();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDb(null);
  await t.close();
});

describe('env', () => {
  it('defaults the threshold to 50,000 and reads VAT_THRESHOLD_NOK', () => {
    expect(vatThresholdNok({})).toBe(DEFAULT_VAT_THRESHOLD_NOK);
    expect(vatThresholdNok({ VAT_THRESHOLD_NOK: '60000' })).toBe(60_000);
    expect(vatThresholdNok({ VAT_THRESHOLD_NOK: 'nonsense' })).toBe(DEFAULT_VAT_THRESHOLD_NOK);
  });
  it('is enabled unless VAT_ALERTS=off', () => {
    expect(vatAlertsEnabled({})).toBe(true);
    expect(vatAlertsEnabled({ VAT_ALERTS: 'off' })).toBe(false);
    expect(vatAlertsEnabled({ VAT_ALERTS: 'OFF' })).toBe(false);
    expect(vatAlertsEnabled({ VAT_ALERTS: 'on' })).toBe(true);
  });
});

describe('checkVatThreshold', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60_000);
  const fetchImpl = vi.fn(async () => okResponse('10'));

  beforeEach(() => {
    fetchImpl.mockClear();
    fetchImpl.mockImplementation(async () => okResponse('10'));
  });

  it('sums only sales within the trailing 365 days, converts with the fetched rate, and ignores 0-EUR sales', async () => {
    await insert(
      sale('cs_in_1', { amountCents: 100_00, paidAt: daysAgo(10) }), // €100
      sale('cs_in_2', { amountCents: 0, paidAt: daysAgo(5) }), // free/test-ish sale, counts as 0
      sale('cs_out', { amountCents: 500_00, paidAt: daysAgo(400) }), // outside the window
    );
    const result = await checkVatThreshold({ db: t.db, fetchImpl, now });
    expect(result).not.toBeNull();
    expect(result!.totalEurCents).toBe(100_00);
    expect(result!.totalNok).toBe(1000); // €100 * rate 10
    expect(result!.rate.fallback).toBe(false);
  });

  it('excludes test-mode (livemode: false) sales from the rolling total', async () => {
    await insert(sale('cs_test', { amountCents: 900_00, paidAt: daysAgo(1), livemode: false }));
    const result = await checkVatThreshold({ db: t.db, fetchImpl, now });
    expect(result!.totalEurCents).toBe(0);
  });

  it('fires each threshold once, in order, as the total crosses it', async () => {
    vi.stubEnv('VAT_THRESHOLD_NOK', '1000'); // 70% = 700, 90% = 900, 100% = 1000 NOK
    // €69 * rate 10 = 690 NOK: below every line.
    await insert(sale('cs_1', { amountCents: 69_00, paidAt: daysAgo(1) }));
    let result = await checkVatThreshold({ db: t.db, fetchImpl, now });
    expect(result!.totalNok).toBe(690);
    let rows = await t.db.select().from(vatAlerts);
    expect(rows.every((r) => !r.active)).toBe(true);

    // Add €1.50 -> 705 NOK: crosses 70% only.
    await insert(sale('cs_2', { amountCents: 1_50, paidAt: daysAgo(1) }));
    await checkVatThreshold({ db: t.db, fetchImpl, now });
    rows = await t.db.select().from(vatAlerts).orderBy(vatAlerts.percent);
    expect(rows.find((r) => r.percent === 70)!.active).toBe(true);
    expect(rows.find((r) => r.percent === 90)!.active).toBe(false);
    expect(rows.find((r) => r.percent === 100)!.active).toBe(false);

    // Add enough to cross 90% and 100% at once.
    await insert(sale('cs_3', { amountCents: 40_00, paidAt: daysAgo(1) }));
    await checkVatThreshold({ db: t.db, fetchImpl, now });
    rows = await t.db.select().from(vatAlerts).orderBy(vatAlerts.percent);
    expect(rows.every((r) => r.active)).toBe(true);
  });

  it('allows a threshold to fire again after the total drops back below it (sales leaving the window)', async () => {
    vi.stubEnv('VAT_THRESHOLD_NOK', '1000');
    await insert(sale('cs_old', { amountCents: 100_00, paidAt: daysAgo(1) })); // 1000 NOK: at 100%
    await checkVatThreshold({ db: t.db, fetchImpl, now });
    let row = await t.db.select().from(vatAlerts).where(eq(vatAlerts.percent, 100)).then((r) => r[0]);
    expect(row!.active).toBe(true);

    // Move the clock forward past that sale's 365-day window: the rolling total drops to 0.
    const later = new Date(daysAgo(1).getTime() + 366 * 24 * 60 * 60_000);
    await checkVatThreshold({ db: t.db, fetchImpl, now: later });
    row = await t.db.select().from(vatAlerts).where(eq(vatAlerts.percent, 100)).then((r) => r[0]);
    expect(row!.active).toBe(false);

    // A new sale re-crosses the line: fires again.
    await insert(sale('cs_new', { amountCents: 100_00, paidAt: later }));
    await checkVatThreshold({ db: t.db, fetchImpl, now: later });
    row = await t.db.select().from(vatAlerts).where(eq(vatAlerts.percent, 100)).then((r) => r[0]);
    expect(row!.active).toBe(true);
  });

  it('falls back to the conservative rate when the Norges Bank API fails, and says so', async () => {
    const failing = vi.fn(async () => new Response('nope', { status: 500 }));
    await insert(sale('cs_1', { amountCents: 100_00, paidAt: daysAgo(1) }));
    const result = await checkVatThreshold({ db: t.db, fetchImpl: failing, now });
    expect(result!.rate.fallback).toBe(true);
    expect(result!.rate.rate).toBe(12.0);
  });

  it('returns null and touches nothing when VAT_ALERTS=off', async () => {
    vi.stubEnv('VAT_ALERTS', 'off');
    await insert(sale('cs_1', { amountCents: 100_000_00, paidAt: daysAgo(1) }));
    const result = await checkVatThreshold({ db: t.db, fetchImpl, now });
    expect(result).toBeNull();
    const rows = await t.db.select().from(vatAlerts);
    expect(rows).toHaveLength(0);
  });
});

describe('what counts', () => {
  it('leaves out refunded licenses and counts manual NOK sales as they are', async () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const paidAt = new Date('2026-09-01T12:00:00Z');
    await insert(
      sale('cs_live_kept', { amountCents: 100_000, paidAt }),
      { ...sale('cs_live_refunded', { amountCents: 500_000, paidAt }), revoked_at: paidAt.toISOString(), revoke_reason: 'refunded' },
      { ...sale('cs_live_revoked', { amountCents: 10_000, paidAt }), revoked_at: paidAt.toISOString(), revoke_reason: 'revoked' },
      { ...sale('manual_nok', { amountCents: 950_000, paidAt }), source: 'manual', currency: 'nok' },
    );
    const fetchImpl = vi.fn(async () => okResponse('10'));
    const result = await checkVatThreshold({ fetchImpl, now });
    // EUR 1,000 + EUR 100 (revoked, not refunded) at 10, plus NOK 9,500.
    expect(result?.totalNok).toBe(20_500);
    expect(result?.totalEurCents).toBe(205_000);
  });
});
