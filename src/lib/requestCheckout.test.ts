import { describe, expect, it, vi } from 'vitest';
import { cardOffError, requestCheckout } from './requestCheckout';
import type { CheckoutRequest } from './checkout';

const payload: CheckoutRequest = { pack: 'servers-m', period: 'year', servers: 20, tools: ['csm'], use: 'commercial' };
const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('requestCheckout', () => {
  it('POSTs the order as JSON', async () => {
    const fetcher = answer(200, { clientSecret: 'cs_test_1_secret_x' });
    await requestCheckout(payload, fetcher);
    expect(fetcher).toHaveBeenCalledWith('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });
  it('reads a client secret (embedded) or a url (hosted)', async () => {
    expect(await requestCheckout(payload, answer(200, { clientSecret: 'cs_test_1_secret_x' }))).toEqual({ kind: 'embedded', clientSecret: 'cs_test_1_secret_x' });
    expect(await requestCheckout(payload, answer(200, { url: 'https://checkout.stripe.com/c/pay/x' }))).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.com/c/pay/x' });
  });
  it('never follows a non-https url or takes a malformed secret', async () => {
    expect((await requestCheckout(payload, answer(200, { url: 'javascript:alert(1)' }))).kind).toBe('failed');
    expect((await requestCheckout(payload, answer(200, { clientSecret: 'nope' }))).kind).toBe('failed');
  });
  it('turns 503 into card off, and shows the server message for 400/409', async () => {
    expect(await requestCheckout(payload, answer(503, { error: 'x' }))).toEqual({ kind: 'failed', cardOff: true, error: cardOffError });
    expect(await requestCheckout(payload, answer(409, { error: 'Founding supporter packs are sold out.' }))).toEqual({
      kind: 'failed',
      cardOff: false,
      error: 'Founding supporter packs are sold out.',
    });
  });
  it('fails cleanly when the network does', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect((await requestCheckout(payload, fetcher)).kind).toBe('failed');
  });
});
