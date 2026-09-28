import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eurNokRate, resetRateCache, FALLBACK_RATE, NORGES_BANK_URL } from './rate';

const okResponse = (rate: string) =>
  Response.json({
    data: { dataSets: [{ series: { '0:0:0:0': { observations: { '0': [rate] } } } }] },
  });

describe('eurNokRate', () => {
  beforeEach(() => resetRateCache());

  it('parses the Norges Bank SDMX-JSON shape', async () => {
    const fetchImpl = vi.fn(async () => okResponse('10.8412'));
    const result = await eurNokRate({ fetchImpl, now: 0 });
    expect(result).toEqual({ rate: 10.8412, fallback: false });
    expect(fetchImpl).toHaveBeenCalledWith(NORGES_BANK_URL, expect.anything());
  });

  it('caches the rate for 12 hours', async () => {
    const fetchImpl = vi.fn(async () => okResponse('10'));
    await eurNokRate({ fetchImpl, now: 0 });
    const result = await eurNokRate({ fetchImpl, now: 11 * 60 * 60_000 }); // 11h later: still cached
    expect(result.rate).toBe(10);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache is more than 12 hours old', async () => {
    const fetchImpl = vi.fn(async () => okResponse('10'));
    await eurNokRate({ fetchImpl, now: 0 });
    await eurNokRate({ fetchImpl, now: 13 * 60 * 60_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('falls back to a conservative rate on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
    const result = await eurNokRate({ fetchImpl, now: 0 });
    expect(result).toEqual({ rate: FALLBACK_RATE, fallback: true });
  });

  it('falls back when the response has an unexpected shape', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ nothing: 'useful' }));
    const result = await eurNokRate({ fetchImpl, now: 0 });
    expect(result).toEqual({ rate: FALLBACK_RATE, fallback: true });
  });

  it('falls back when the network call throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const result = await eurNokRate({ fetchImpl, now: 0 });
    expect(result).toEqual({ rate: FALLBACK_RATE, fallback: true });
  });
});
