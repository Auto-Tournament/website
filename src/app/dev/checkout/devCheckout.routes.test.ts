import { afterEach, describe, expect, it, vi } from 'vitest';

// /dev/checkout is a development-only preview: a 404 anywhere else.

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/lib/stripePrices', () => ({ getPacks: async () => ({ source: 'fallback', packs: [], priceIds: {} }) }));
vi.mock('./CheckoutPreview', () => ({ CheckoutPreview: () => null }));

const { default: Page } = await import('./page');

afterEach(() => vi.unstubAllEnvs());

describe('/dev/checkout', () => {
  it('is a 404 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('renders in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    notFound.mockClear();
    await expect(Page()).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});
