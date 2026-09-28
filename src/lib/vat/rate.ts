/**
 * The EUR/NOK exchange rate, from Norges Bank's open data API (no key
 * needed). Cached for 12 hours; a failed fetch falls back to a conservative
 * FALLBACK_RATE (12.0 NOK per EUR — higher than the rate has been in
 * practice, so the fallback never understates the NOK total).
 *
 * No process.env read beyond the fetch itself and no Next import, so it is
 * easy to test.
 */

export const NORGES_BANK_URL = 'https://data.norges-bank.no/api/data/EXR/B.EUR.NOK.SP?lastNObservations=1&format=sdmx-json';
/** NOK per EUR, used only when the API can't be reached or returns something unexpected. */
export const FALLBACK_RATE = 12.0;
const CACHE_MS = 12 * 60 * 60_000;
const TIMEOUT_MS = 8_000;

export type RateResult = { rate: number; fallback: boolean };

type Fetch = typeof fetch;

let cache: { result: RateResult; fetchedAt: number } | null = null;

/** Tests only: clears the in-process cache. */
export function resetRateCache(): void {
  cache = null;
}

function parseRate(body: unknown): number | null {
  const data = body as {
    data?: { dataSets?: { series?: Record<string, { observations?: Record<string, unknown[]> }> }[] };
  };
  const series = data?.data?.dataSets?.[0]?.series;
  if (!series) return null;
  const first = Object.values(series)[0];
  const value = first?.observations?.['0']?.[0];
  const rate = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * The latest EUR/NOK rate, cached in-process for 12 hours. Sales are all
 * converted with this single latest rate rather than a historical rate per
 * sale's own day: Norges Bank's API needs one request per day to do that, and
 * the rate moves little day to day, so it isn't worth the extra calls for a
 * one-person alert. The rate used is always shown in the alert email.
 */
export async function eurNokRate(options: { fetchImpl?: Fetch; now?: number } = {}): Promise<RateResult> {
  const now = options.now ?? Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) return cache.result;
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(NORGES_BANK_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const rate = parseRate(await res.json());
    if (rate === null) throw new Error('unexpected response shape');
    const result: RateResult = { rate, fallback: false };
    cache = { result, fetchedAt: now };
    return result;
  } catch (err) {
    console.error('[vat] Norges Bank EUR/NOK rate fetch failed; using the fallback rate', err instanceof Error ? err.message : err);
    const result: RateResult = { rate: FALLBACK_RATE, fallback: true };
    cache = { result, fetchedAt: now };
    return result;
  }
}

// ---------------------------------------------------------------------------
// Daily rates, for the bookkeeping export

export const NORGES_BANK_RANGE_URL = 'https://data.norges-bank.no/api/data/EXR/B.EUR.NOK.SP';

/** The observations of one series, by day: { '2026-09-25': 11.52, … }. Null when the shape is unexpected. */
function parseDailyRates(body: unknown): Map<string, number> | null {
  const data = body as {
    data?: {
      dataSets?: { series?: Record<string, { observations?: Record<string, unknown[]> }> }[];
      structure?: { dimensions?: { observation?: { id?: string; values?: { id?: string }[] }[] } };
    };
  };
  const series = data?.data?.dataSets?.[0]?.series;
  const days = data?.data?.structure?.dimensions?.observation?.find((d) => d.id === 'TIME_PERIOD')?.values ?? data?.data?.structure?.dimensions?.observation?.[0]?.values;
  if (!series || !days) return null;
  const obs = Object.values(series)[0]?.observations;
  if (!obs) return null;
  const out = new Map<string, number>();
  for (const [index, values] of Object.entries(obs)) {
    const day = days[Number(index)]?.id;
    const rate = Number(values?.[0]);
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(rate) && rate > 0) out.set(day, rate);
  }
  return out.size > 0 ? out : null;
}

/**
 * Norges Bank's EUR/NOK rate for each business day in [from − 10 days, to],
 * in one request. `rateOn(day)` is the rate of that day or the last business
 * day before it (as bookkeeping uses). Null when the API can't be read: the
 * caller falls back to one rate (eurNokRate).
 */
export async function eurNokDailyRates(
  from: string,
  to: string,
  options: { fetchImpl?: Fetch } = {},
): Promise<{ rateOn: (day: string) => number | null } | null> {
  const start = new Date(`${from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 10);
  const url = `${NORGES_BANK_RANGE_URL}?format=sdmx-json&startPeriod=${start.toISOString().slice(0, 10)}&endPeriod=${to}`;
  try {
    const res = await (options.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const rates = parseDailyRates(await res.json());
    if (!rates) throw new Error('unexpected response shape');
    const days = [...rates.keys()].sort();
    return {
      rateOn(day) {
        let found: number | null = null;
        for (const d of days) {
          if (d > day) break;
          found = rates.get(d) ?? found;
        }
        return found;
      },
    };
  } catch (err) {
    console.error('[vat] Norges Bank daily EUR/NOK rates fetch failed', err instanceof Error ? err.message : 'unknown error');
    return null;
  }
}
